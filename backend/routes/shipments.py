import mysql.connector
from flask import Blueprint, request, jsonify
from db import get_db_connection
import json
from collections import Counter
from datetime import date, timedelta, datetime
from routes.auth_decorators import admin_required

shipments_bp = Blueprint('shipments', __name__)

@shipments_bp.route('', methods=['POST'])
@shipments_bp.route('/', methods=['POST'])
def add_shipment():
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO shipments (customer_name, job_number, shipping_date, qc_name) VALUES (%s, %s, %s, %s)",
            (data['customer_name'], data['job_number'], data['shipping_date'], data['qc_name'])
        )
        conn.commit()
        new_id = cursor.lastrowid
        return jsonify({'message': 'Shipment created successfully', 'id': new_id}), 201
    except mysql.connector.Error as err:
        if err.errno == 1062:
             return jsonify({'error': f"A shipment with Job Number '{data['job_number']}' for date '{data['shipping_date']}' already exists."}), 409
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()


@shipments_bp.route('', methods=['GET'])
@shipments_bp.route('/', methods=['GET'])
def get_shipments():
    search_term = request.args.get('search', '')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('limit', 10))
    offset = (page - 1) * per_page

    query = """
    SELECT
        s.id, s.job_number, s.customer_name, s.shipping_date, s.status,
        COUNT(DISTINCT su_search.unit_id) AS total_units,
        (
            SELECT CONCAT(
                '[',
                IFNULL(GROUP_CONCAT(
                    JSON_OBJECT('model_type', su.model_type, 'count', su.unit_count)
                ), ''),
                ']'
            )
            FROM (
                SELECT model_type, COUNT(unit_id) as unit_count
                FROM shipped_units
                WHERE shipment_id = s.id
                GROUP BY model_type
            ) as su
        ) as shipped_units_summary
    FROM shipments s
    LEFT JOIN shipped_units su_search ON s.id = su_search.shipment_id
    """
    
    where_clauses = []
    params = []
    if search_term:
        where_clauses.append("""
            (s.job_number LIKE %s OR s.customer_name LIKE %s OR su_search.serial_number LIKE %s OR su_search.original_serial_number LIKE %s
            OR su_search.part_number LIKE %s OR su_search.model_type LIKE %s)
        """)
        like_term = f"%{search_term}%"
        params.extend([like_term] * 6)
    if start_date:
        where_clauses.append("s.shipping_date >= %s")
        params.append(start_date)
    if end_date:
        where_clauses.append("s.shipping_date <= %s")
        params.append(end_date)

    if status and status in ['In Progress', 'Completed']:
        where_clauses.append("s.status = %s")
        params.append(status)
    
    count_query_params = list(params)

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " GROUP BY s.id ORDER BY s.shipping_date DESC, s.id DESC"
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    count_cursor = conn.cursor()
    count_query = "SELECT COUNT(DISTINCT s.id) FROM shipments s"
    if search_term:
        count_query += " LEFT JOIN shipped_units su_search ON s.id = su_search.shipment_id"
    if where_clauses:
        count_query += " WHERE " + " AND ".join(where_clauses)
    
    count_cursor.execute(count_query, tuple(count_query_params))
    total_records = count_cursor.fetchone()[0]
    count_cursor.close()

    query += " LIMIT %s OFFSET %s"
    params.extend([per_page, offset])

    cursor.execute(query, tuple(params))
    shipments = cursor.fetchall()
    cursor.close()
    conn.close()

    for shipment in shipments:
        shipment['shipping_date'] = shipment['shipping_date'].isoformat()
        shipment['shipped_units_summary'] = json.loads(shipment['shipped_units_summary'])

    return jsonify({
        'shipments': shipments,
        'total_pages': (total_records + per_page - 1) // per_page,
        'current_page': page
    })


@shipments_bp.route('/<int:shipment_id>', methods=['GET'])
def get_shipment_details(shipment_id):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM shipments WHERE id = %s", (shipment_id,))
    shipment = cursor.fetchone()
    if not shipment:
        return jsonify({'error': 'Shipment not found'}), 404
    shipment['shipping_date'] = shipment['shipping_date'].isoformat()

    cursor.execute("SELECT * FROM shipped_units WHERE shipment_id = %s ORDER BY unit_id", (shipment_id,))
    shipment['units'] = cursor.fetchall()

    query = """
    SELECT
        mi.item_id,
        mi.item_text,
        sr.status,
        sr.completed_by,
        sr.completion_date,
        sr.comments 
    FROM checklist_master_items mi
    LEFT JOIN shipment_checklist_responses sr ON mi.item_id = sr.item_id AND sr.shipment_id = %s
    WHERE mi.is_active = TRUE
    ORDER BY mi.item_order
    """
    cursor.execute(query, (shipment_id,))
    checklist_items = cursor.fetchall()
    for item in checklist_items:
        if item.get('completion_date'):
            item['completion_date'] = item['completion_date'].isoformat()
    shipment['checklist_items'] = checklist_items

    cursor.close()
    conn.close()
    return jsonify(shipment)


@shipments_bp.route('/<int:shipment_id>/status', methods=['PUT'])
def update_shipment_status(shipment_id):
    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['In Progress', 'Completed']:
        return jsonify({'error': "Invalid status"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE shipments SET status = %s WHERE id = %s", (new_status, shipment_id))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({'message': f'Shipment status updated to {new_status}'})

@shipments_bp.route('/<int:shipment_id>', methods=['DELETE'])
@admin_required
def delete_shipment(shipment_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # First, delete related records from shipped_units
        cursor.execute("DELETE FROM shipped_units WHERE shipment_id = %s", (shipment_id,))
        
        # Second, delete related records from shipment_checklist_responses
        cursor.execute("DELETE FROM shipment_checklist_responses WHERE shipment_id = %s", (shipment_id,))
        
        # Now, delete the shipment itself
        cursor.execute("DELETE FROM shipments WHERE id = %s", (shipment_id,))
        
        conn.commit()
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Shipment not found or already deleted'}), 404
            
        return jsonify({'message': 'Shipment and all related data successfully deleted'}), 200
    except mysql.connector.Error as err:
        conn.rollback() # Rollback in case of an error
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@shipments_bp.route('/stats', methods=['GET'])
def get_dashboard_stats():
    search_term = request.args.get('search', '')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    shipment_id_subquery = "SELECT DISTINCT s.id FROM shipments s"
    shipment_where_clauses = []
    shipment_params = []

    if search_term:
        shipment_id_subquery += " LEFT JOIN shipped_units su ON s.id = su.shipment_id"
        shipment_where_clauses.append("""(s.job_number LIKE %s OR s.customer_name LIKE %s OR su.serial_number LIKE %s
            OR su.part_number LIKE %s OR su.model_type LIKE %s)""")
        like_term = f"%{search_term}%"
        shipment_params.extend([like_term] * 5)
    if start_date:
        shipment_where_clauses.append("shipping_date >= %s")
        shipment_params.append(start_date)
    if end_date:
        shipment_where_clauses.append("shipping_date <= %s")
        shipment_params.append(end_date)
        
    if shipment_where_clauses:
        shipment_id_subquery += " WHERE " + " AND ".join(shipment_where_clauses)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(f"SELECT COUNT(id) as total_shipments FROM ({shipment_id_subquery}) as filtered_shipments", tuple(shipment_params))
    total_shipments = cursor.fetchone()['total_shipments']

    unit_query = f"""
        SELECT 
            COUNT(unit_id) as total_units,
            (SUM(CASE WHEN first_test_pass = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(unit_id), 0)) * 100 as fpy
        FROM shipped_units 
        WHERE shipment_id IN ({shipment_id_subquery})
    """
    cursor.execute(unit_query, tuple(shipment_params))
    unit_stats = cursor.fetchone()
    total_units = unit_stats['total_units'] or 0
    fpy = unit_stats['fpy'] or 0

    retest_fetch_query = f"""
        SELECT retest_reason FROM shipped_units
        WHERE first_test_pass = FALSE AND retest_reason IS NOT NULL AND retest_reason != ''
        AND shipment_id IN ({shipment_id_subquery})
    """
    cursor.execute(retest_fetch_query, tuple(shipment_params))
    raw_reasons_list = cursor.fetchall()
    
    reason_counts = Counter()
    for row in raw_reasons_list:
        reasons = [r.strip() for r in row['retest_reason'].split(',')]
        reason_counts.update(reasons)
    
    retest_reasons = [{'retest_reason': reason, 'count': count} for reason, count in reason_counts.items()]

    failed_equipment_fetch_query = f"""
        SELECT failed_equipment FROM shipped_units
        WHERE first_test_pass = FALSE AND failed_equipment IS NOT NULL AND failed_equipment != ''
        AND shipment_id IN ({shipment_id_subquery})
    """
    cursor.execute(failed_equipment_fetch_query, tuple(shipment_params))
    raw_failed_equipment_list = cursor.fetchall()

    failed_equipment_counts = Counter()
    for row in raw_failed_equipment_list:
        if row['failed_equipment']:
            failed_equipment_counts.update([row['failed_equipment']])

    failed_equipment_stats = [{'equipment': equipment, 'count': count} for equipment, count in failed_equipment_counts.items()]
    
    cursor.close()
    conn.close()

    return jsonify({
        'total_shipments': total_shipments,
        'total_units_shipped': total_units,
        'first_pass_yield': round(fpy, 2),
        'retest_reasons': retest_reasons,
        'failed_equipment_stats': failed_equipment_stats
    })


@shipments_bp.route('/stats/over-time', methods=['GET'])
def get_stats_over_time():
    search_term = request.args.get('search', '')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    where_clauses = []
    params = []
    
    if search_term:
        where_clauses.append("""(s.job_number LIKE %s OR s.customer_name LIKE %s OR su.serial_number LIKE %s
            OR su.part_number LIKE %s OR su.model_type LIKE %s)""")
        like_term = f"%{search_term}%"
        params.extend([like_term] * 5)
    if start_date:
        where_clauses.append("s.shipping_date >= %s")
        params.append(start_date)
    if end_date:
        where_clauses.append("s.shipping_date <= %s")
        params.append(end_date)
        
    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)
    
    query = f"""
    SELECT
        DATE_FORMAT(s.shipping_date, '%Y-%m') AS month,
        COUNT(su.unit_id) AS total_units,
        (SUM(CASE WHEN su.first_test_pass = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(su.unit_id), 0)) * 100 AS first_pass_yield
    FROM
        shipped_units su
    JOIN
        shipments s ON su.shipment_id = s.id
    {where_sql}
    GROUP BY
        month
    ORDER BY
        month DESC
    LIMIT 12;
    """
    try:
        cursor.execute(query, tuple(params))
        data = cursor.fetchall()
        data.reverse()

        labels = [row['month'] for row in data]
        total_units_data = [row['total_units'] for row in data]
        fpy_data = [round(row['first_pass_yield'], 2) if row['first_pass_yield'] is not None else 0 for row in data]

        chart_data = {
            "labels": labels,
            "totalUnits": total_units_data,
            "fpy": fpy_data
        }
        return jsonify(chart_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@shipments_bp.route('/manifest', methods=['GET'])
def get_manifest_data():
    search_term = request.args.get('search', '')
    customer_name = request.args.get('customer', '') # This is now redundant if search is used
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    base_query = "SELECT DISTINCT s.id, s.job_number, s.customer_name, s.shipping_date FROM shipments s"
    where_clauses = []
    params = []

    if search_term:
        base_query += " LEFT JOIN shipped_units su ON s.id = su.shipment_id"
        where_clauses.append("(s.job_number LIKE %s OR s.customer_name LIKE %s OR su.serial_number LIKE %s OR su.original_serial_number LIKE %s OR su.part_number LIKE %s OR su.model_type LIKE %s)")
        like_term = f"%{search_term}%"
        params.extend([like_term] * 6)
    elif customer_name:
        where_clauses.append("s.customer_name LIKE %s")
        params.append(f"%{customer_name}%")

    if start_date:
        where_clauses.append("s.shipping_date >= %s")
        params.append(start_date)
    if end_date:
        where_clauses.append("s.shipping_date <= %s")
        params.append(end_date)
    
    if where_clauses:
        base_query += " WHERE " + " AND ".join(where_clauses)
    
    base_query += " ORDER BY s.shipping_date DESC, s.id DESC"

    try:
        cursor.execute(base_query, tuple(params))
        shipments = cursor.fetchall()
        
        for shipment in shipments:
            unit_query = "SELECT model_type, part_number, serial_number, original_serial_number FROM shipped_units WHERE shipment_id = %s"
            unit_params = [shipment['id']]

            if search_term:
                like_term = f"%{search_term}%"
                # First, try to filter units by the search term
                filtered_unit_query = unit_query + " AND (part_number LIKE %s OR serial_number LIKE %s OR original_serial_number LIKE %s OR model_type LIKE %s) ORDER BY model_type, part_number"
                cursor.execute(filtered_unit_query, tuple(unit_params + [like_term] * 4))
                units_list = cursor.fetchall()

                # If no units match, it could be because the search term matched a shipment-level field (job or customer).
                # In that case, we should show all units for that shipment.
                if not units_list:
                    # Check if the shipment itself matched
                    if (search_term.lower() in str(shipment.get('job_number') or '').lower() or 
                        search_term.lower() in str(shipment.get('customer_name') or '').lower()):
                        
                        # Fetch all units for the shipment
                        all_units_query = unit_query + " ORDER BY model_type, part_number"
                        cursor.execute(all_units_query, tuple(unit_params))
                        units_list = cursor.fetchall()
            else:
                # No search term, so fetch all units
                all_units_query = unit_query + " ORDER BY model_type, part_number"
                cursor.execute(all_units_query, tuple(unit_params))
                units_list = cursor.fetchall()

            shipment['units'] = units_list
            
            # Now, use the correct local variable 'units_list' for calculations
            shipment['total_units'] = len(units_list)
            
            summary_counts = Counter(unit['model_type'] for unit in units_list)
            shipment['shipped_units_summary'] = [
                {'model_type': model_type, 'count': count} 
                for model_type, count in summary_counts.items()
            ]

            shipment['shipping_date'] = shipment['shipping_date'].isoformat()
            
        return jsonify(shipments)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# --- ADD THIS ENTIRE NEW FUNCTION AT THE END OF THE FILE ---
@shipments_bp.route('/weekly', methods=['GET'])
def get_weekly_shipments():
    """
    Fetches all shipments and their units for a given week (Sunday to Saturday).
    Uses the week of the provided 'date' parameter, or the current week if not provided.
    """
    date_str = request.args.get('date')
    target_date = None
    if date_str:
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': "Invalid date format for 'date'. Use YYYY-MM-DD."}), 400
    else:
        target_date = date.today()

    # Calculate the start of the week (Sunday)
    start_of_week = target_date - timedelta(days=(target_date.weekday() + 1) % 7)
    # Calculate the end of the week (Saturday)
    end_of_week = start_of_week + timedelta(days=6)

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id, job_number, customer_name, shipping_date, status FROM shipments WHERE shipping_date BETWEEN %s AND %s ORDER BY shipping_date, id",
            (start_of_week, end_of_week)
        )
        shipments = cursor.fetchall()
        
        # For each shipment, fetch its units and also calculate summaries
        for shipment in shipments:
            cursor.execute(
                "SELECT model_type, part_number, serial_number, original_serial_number FROM shipped_units WHERE shipment_id = %s ORDER BY model_type, part_number", 
                (shipment['id'],)
            )
            units = cursor.fetchall()
            shipment['units'] = units # Keep the full list for any future detail view
            
            # --- ADD THIS LOGIC (copied from manifest endpoint) ---
            shipment['total_units'] = len(units)
            
            summary_counts = Counter(unit['model_type'] for unit in units)
            shipment['shipped_units_summary'] = [
                {'model_type': model_type, 'count': count} 
                for model_type, count in summary_counts.items()
            ]
            # --- END OF ADDED LOGIC ---

            shipment['shipping_date'] = shipment['shipping_date'].isoformat()
        
        response_data = {
            "shipments": shipments,
            "date_range": { "start": start_of_week.isoformat(), "end": end_of_week.isoformat() }
        }
        return jsonify(response_data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()