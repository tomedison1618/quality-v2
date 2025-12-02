from psycopg import errors
from flask import Blueprint, request, jsonify
from db import get_db_connection, get_dict_cursor
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO shipments (customer_name, job_number, shipping_date, qc_name) VALUES (%s, %s, %s, %s) RETURNING id",
            (data['customer_name'], data['job_number'], data['shipping_date'], data['qc_name'])
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Shipment created successfully', 'id': new_id}), 201
    except errors.UniqueViolation:
        conn.rollback()
        return jsonify({'error': f"A shipment with Job Number '{data['job_number']}' for date '{data['shipping_date']}' already exists."}), 409
    except Exception as err:
        conn.rollback()
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
        s.id,
        s.job_number,
        s.customer_name,
        s.shipping_date,
        s.status,
        COUNT(DISTINCT su_search.unit_id) AS total_units,
        COALESCE(
            (
                SELECT json_agg(json_build_object('model_type', su.model_type, 'count', su.unit_count))
                FROM (
                    SELECT model_type, COUNT(unit_id) AS unit_count
                    FROM shipped_units
                    WHERE shipment_id = s.id
                    GROUP BY model_type
                ) su
            ),
            '[]'::json
        ) AS shipped_units_summary
    FROM shipments s
    LEFT JOIN shipped_units su_search ON s.id = su_search.shipment_id
    """
    
    where_clauses = []
    params = []
    if search_term:
        where_clauses.append("""
            (s.job_number ILIKE %s OR s.customer_name ILIKE %s OR su_search.serial_number ILIKE %s OR su_search.original_serial_number ILIKE %s
            OR su_search.part_number ILIKE %s OR su_search.model_type ILIKE %s)
        """)
        like_term = f"%{search_term}%"
        params.extend([like_term] * 6)
    # Apply date filters only when no explicit search term is provided.
    # This ensures text search spans all dates (consistent with Manifest page behavior).
    if not search_term:
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    count_cursor = None
    shipments = []
    total_records = 0
    try:
        cursor = get_dict_cursor(conn)
        count_cursor = conn.cursor()
        count_query = "SELECT COUNT(DISTINCT s.id) FROM shipments s"
        if search_term:
            count_query += " LEFT JOIN shipped_units su_search ON s.id = su_search.shipment_id"
        if where_clauses:
            count_query += " WHERE " + " AND ".join(where_clauses)

        count_cursor.execute(count_query, tuple(count_query_params))
        count_result = count_cursor.fetchone()
        if count_result:
            total_records = count_result[0] or 0

        query += " LIMIT %s OFFSET %s"
        params.extend([per_page, offset])

        cursor.execute(query, tuple(params))
        shipments = cursor.fetchall()
    except Exception as err:
        return jsonify({'error': str(err)}), 500
    finally:
        if count_cursor:
            count_cursor.close()
        if cursor:
            cursor.close()
        conn.close()

    for shipment in shipments:
        if shipment.get('shipping_date'):
            shipment['shipping_date'] = shipment['shipping_date'].isoformat()
        summary = shipment.get('shipped_units_summary') or []
        if isinstance(summary, str):
            shipment['shipped_units_summary'] = json.loads(summary)
        else:
            shipment['shipped_units_summary'] = summary

    return jsonify({
        'shipments': shipments,
        'total_pages': (total_records + per_page - 1) // per_page,
        'current_page': page
    })


@shipments_bp.route('/<int:shipment_id>', methods=['GET'])
def get_shipment_details(shipment_id):
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = None
    try:
        cursor = get_dict_cursor(conn)
        cursor.execute("SELECT * FROM shipments WHERE id = %s", (shipment_id,))
        shipment = cursor.fetchone()
        if not shipment:
            return jsonify({'error': 'Shipment not found'}), 404
        if shipment.get('shipping_date'):
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

        return jsonify(shipment)
    except Exception as err:
        return jsonify({'error': str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        conn.close()


@shipments_bp.route('/<int:shipment_id>/status', methods=['PUT'])
def update_shipment_status(shipment_id):
    data = request.get_json()
    new_status = data.get('status')
    if new_status not in ['In Progress', 'Completed']:
        return jsonify({'error': "Invalid status"}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE shipments SET status = %s WHERE id = %s", (new_status, shipment_id))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Shipment not found'}), 404
        return jsonify({'message': f'Shipment status updated to {new_status}'})
    except Exception as err:
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@shipments_bp.route('/<int:shipment_id>', methods=['DELETE'])
@admin_required
def delete_shipment(shipment_id):
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM shipments WHERE id = %s", (shipment_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Shipment not found or already deleted'}), 404
            
        return jsonify({'message': 'Shipment and all related data successfully deleted'}), 200
    except Exception as err:
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

    like_term = None
    if search_term:
        like_term = f"%{search_term}%"
        shipment_id_subquery += " LEFT JOIN shipped_units su ON s.id = su.shipment_id"
        shipment_where_clauses.append("""(s.job_number ILIKE %s OR s.customer_name ILIKE %s OR su.serial_number ILIKE %s
            OR su.part_number ILIKE %s OR su.model_type ILIKE %s)""")
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = None
    try:
        cursor = get_dict_cursor(conn)

        cursor.execute(f"SELECT COUNT(id) as total_shipments FROM ({shipment_id_subquery}) as filtered_shipments", tuple(shipment_params))
        total_shipments_row = cursor.fetchone() or {}
        total_shipments = total_shipments_row.get('total_shipments', 0)

        unit_query = f"""
        SELECT 
            COUNT(unit_id) as total_units,
            SUM(CASE WHEN first_test_pass = TRUE THEN 1 ELSE 0 END) as total_first_pass
        FROM shipped_units 
        WHERE shipment_id IN ({shipment_id_subquery})
    """
        cursor.execute(unit_query, tuple(shipment_params))
        unit_stats = cursor.fetchone() or {}
        total_units = unit_stats.get('total_units') or 0
        total_first_pass = unit_stats.get('total_first_pass') or 0

        fpy = (total_first_pass / total_units) * 100 if total_units else 0

        if search_term and like_term:
            filter_dimension = None
            filter_value = None

            # Prefer an exact part number match if it uniquely identifies a product.
            part_exact_query = f"""
            SELECT DISTINCT part_number
            FROM shipped_units
            WHERE shipment_id IN ({shipment_id_subquery}) AND LOWER(part_number) = LOWER(%s)
        """
            part_exact_params = shipment_params.copy()
            part_exact_params.append(search_term)
            cursor.execute(part_exact_query, tuple(part_exact_params))
            part_exact_matches = [row['part_number'] for row in cursor.fetchall()]

            if part_exact_matches:
                unique_matches = {pn.lower(): pn for pn in part_exact_matches}
                if len(unique_matches) == 1:
                    filter_dimension = 'part_number'
                    filter_value = next(iter(unique_matches.values()))

            if not filter_dimension:
                part_like_query = f"""
                SELECT DISTINCT part_number
                FROM shipped_units
                WHERE shipment_id IN ({shipment_id_subquery})
                AND part_number ILIKE %s
            """
                part_like_params = shipment_params.copy()
                part_like_params.append(like_term)
                cursor.execute(part_like_query, tuple(part_like_params))
                part_like_matches = [row['part_number'] for row in cursor.fetchall()]

                if part_like_matches:
                    lowered = [pn.lower() for pn in part_like_matches]
                    if search_term.lower() in lowered:
                        filter_dimension = 'part_number'
                        filter_value = part_like_matches[lowered.index(search_term.lower())]
                    elif len(set(lowered)) == 1:
                        filter_dimension = 'part_number'
                        filter_value = part_like_matches[0]
                    elif len(part_like_matches) == 1:
                        filter_dimension = 'part_number'
                        filter_value = part_like_matches[0]

            if not filter_dimension:
                # Fall back to model_type matching when part number doesn't uniquely identify a product.
                exact_type_query = f"""
                SELECT DISTINCT model_type 
                FROM shipped_units 
                WHERE shipment_id IN ({shipment_id_subquery}) AND LOWER(model_type) = LOWER(%s)
            """
                exact_type_params = shipment_params.copy()
                exact_type_params.append(search_term)
                cursor.execute(exact_type_query, tuple(exact_type_params))
                exact_matches = [row['model_type'] for row in cursor.fetchall()]

                if len(exact_matches) == 1:
                    filter_dimension = 'model_type'
                    filter_value = exact_matches[0]
                else:
                    like_type_query = f"""
                    SELECT DISTINCT model_type 
                    FROM shipped_units 
                    WHERE shipment_id IN ({shipment_id_subquery}) 
                    AND (model_type ILIKE %s OR part_number ILIKE %s)
                """
                    like_type_params = shipment_params.copy()
                    like_type_params.extend([like_term, like_term])
                    cursor.execute(like_type_query, tuple(like_type_params))
                    like_matches = [row['model_type'] for row in cursor.fetchall()]

                    if like_matches:
                        lowered_matches = [mt.lower() for mt in like_matches]
                        if search_term.lower() in lowered_matches:
                            filter_dimension = 'model_type'
                            filter_value = like_matches[lowered_matches.index(search_term.lower())]
                        elif len(set(lowered_matches)) == 1:
                            filter_dimension = 'model_type'
                            filter_value = like_matches[0]
                        elif len(like_matches) == 1:
                            filter_dimension = 'model_type'
                            filter_value = like_matches[0]

            if filter_dimension and filter_value:
                filtered_query = f"""
                SELECT 
                    COUNT(unit_id) as filtered_units,
                    SUM(CASE WHEN first_test_pass = TRUE THEN 1 ELSE 0 END) as filtered_first_pass
                FROM shipped_units 
                WHERE shipment_id IN ({shipment_id_subquery}) AND {filter_dimension} = %s
            """
                filtered_params = shipment_params.copy()
                filtered_params.append(filter_value)
                cursor.execute(filtered_query, tuple(filtered_params))
                filtered_stats = cursor.fetchone() or {}
                filtered_units = filtered_stats.get('filtered_units') or 0
                filtered_first_pass = filtered_stats.get('filtered_first_pass') or 0

                if filtered_units:
                    fpy = (filtered_first_pass / filtered_units) * 100

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
        
        return jsonify({
            'total_shipments': total_shipments,
            'total_units_shipped': total_units,
            'first_pass_yield': round(fpy, 2),
            'retest_reasons': retest_reasons,
            'failed_equipment_stats': failed_equipment_stats
        })
    except Exception as err:
        return jsonify({'error': str(err)}), 500
    finally:
        if cursor:
            cursor.close()
        conn.close()

@shipments_bp.route('/stats/over-time', methods=['GET'])
def get_stats_over_time():
    search_term = request.args.get('search', '')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)

    where_clauses = []
    params = []
    
    if search_term:
        where_clauses.append("""(s.job_number ILIKE %s OR s.customer_name ILIKE %s OR su.serial_number ILIKE %s
            OR su.part_number ILIKE %s OR su.model_type ILIKE %s)""")
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
        to_char(s.shipping_date, 'YYYY-MM') AS month,
        COUNT(su.unit_id) AS total_units,
        (SUM(CASE WHEN su.first_test_pass = TRUE THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(su.unit_id), 0)) * 100 AS first_pass_yield
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

@shipments_bp.route('/fpy/weekly', methods=['GET'])
def get_weekly_fpy_stats():
    """
    Returns weekly First Pass Yield statistics grouped by product (model_type).
    Weeks begin on Sunday and end on Saturday.
    Query params:
      - anchor_date (YYYY-MM-DD) : week that acts as the latest week in the window (defaults to today)
      - weeks (int) : number of weeks to include looking backwards from anchor (defaults to 6, capped at 26)
    """
    anchor_date_str = request.args.get('anchor_date')
    weeks_param = request.args.get('weeks')

    try:
        anchor_date = datetime.strptime(anchor_date_str, '%Y-%m-%d').date() if anchor_date_str else date.today()
    except ValueError:
        return jsonify({'error': "Invalid anchor_date format. Use YYYY-MM-DD."}), 400

    try:
        weeks_count = int(weeks_param) if weeks_param else 6
    except ValueError:
        return jsonify({'error': "Invalid weeks parameter. Use an integer between 1 and 26."}), 400
    weeks_count = max(1, min(weeks_count, 26))

    # Align anchor date to Sunday (start of week used throughout the UI).
    anchor_weekday = (anchor_date.weekday() + 1) % 7  # convert Monday=0 to Sunday=0
    anchor_start = anchor_date - timedelta(days=anchor_weekday)
    anchor_end = anchor_start + timedelta(days=6)

    # Compute the earliest week we need to include.
    start_range = anchor_start - timedelta(days=7 * (weeks_count - 1))
    end_range = anchor_end

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)

    # The SQL groups by model type and Sunday-based week bucket.
    stats_query = """
        SELECT
            (s.shipping_date - (EXTRACT(DOW FROM s.shipping_date)::int) * INTERVAL '1 day')::date AS week_start,
            su.part_number,
            su.model_type,
            COUNT(*) AS total_units,
            SUM(CASE WHEN su.first_test_pass = TRUE THEN 1 ELSE 0 END) AS first_pass_units
        FROM shipped_units su
        JOIN shipments s ON su.shipment_id = s.id
        WHERE s.shipping_date BETWEEN %s AND %s
        GROUP BY week_start, su.part_number, su.model_type
    """

    try:
        cursor.execute(stats_query, (start_range, end_range))
        rows = cursor.fetchall()
    except Exception as err:
        cursor.close()
        conn.close()
        return jsonify({'error': str(err)}), 500

    cursor.close()
    conn.close()

    data_map = {}
    part_numbers = {}
    for row in rows:
        week_start = row['week_start']
        part_number = row['part_number']
        model_type = row['model_type']
        part_numbers.setdefault(week_start, set()).add((part_number, model_type))
        data_map[(week_start, part_number)] = {
            'total_units': row['total_units'],
            'first_pass_units': row['first_pass_units'],
            'model_type': model_type
        }

    weeks_payload = []
    for i in range(weeks_count):
        week_start = anchor_start - timedelta(days=7 * i)
        week_end = week_start + timedelta(days=6)
        week_entry = {
            'start': week_start.isoformat(),
            'end': week_end.isoformat(),
            'label': f"{week_start.isoformat()} to {week_end.isoformat()}",
            'products': [],
            'totals': {
                'total_units': 0,
                'first_pass_units': 0,
                'first_pass_yield': 0
            }
        }

        total_units_week = 0
        first_pass_week = 0
        week_part_numbers = sorted(part_numbers.get(week_start, []), key=lambda x: (x[0] or '', x[1] or ''))
        for part_number, model in week_part_numbers:
            stats = data_map.get((week_start, part_number))
            total_units = (stats['total_units'] if stats else 0) or 0
            first_pass_units = (stats['first_pass_units'] if stats else 0) or 0
            fpy = (first_pass_units / total_units) * 100 if total_units else 0
            week_entry['products'].append({
                'part_number': part_number,
                'model_type': model,
                'total_units': total_units,
                'first_pass_units': first_pass_units,
                'first_pass_yield': round(fpy, 2)
            })
            total_units_week += total_units
            first_pass_week += first_pass_units

        if total_units_week:
            week_entry['totals']['total_units'] = total_units_week
            week_entry['totals']['first_pass_units'] = first_pass_week
            week_entry['totals']['first_pass_yield'] = round((first_pass_week / total_units_week) * 100, 2)

        # Maintain chronological order from newest week at top.
        weeks_payload.append(week_entry)

    return jsonify({
        'anchor_week_start': anchor_start.isoformat(),
        'anchor_week_end': anchor_end.isoformat(),
        'weeks_requested': weeks_count,
        'weeks': weeks_payload
    })


@shipments_bp.route('/manifest', methods=['GET'])
def get_manifest_data():
    search_term = request.args.get('search', '')
    customer_name = request.args.get('customer', '') # This is now redundant if search is used
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)

    base_query = "SELECT DISTINCT s.id, s.job_number, s.customer_name, s.shipping_date FROM shipments s"
    where_clauses = []
    params = []

    if search_term:
        base_query += " LEFT JOIN shipped_units su ON s.id = su.shipment_id"
        where_clauses.append("(s.job_number ILIKE %s OR s.customer_name ILIKE %s OR su.serial_number ILIKE %s OR su.original_serial_number ILIKE %s OR su.part_number ILIKE %s OR su.model_type ILIKE %s)")
        like_term = f"%{search_term}%"
        params.extend([like_term] * 6)
    elif customer_name:
        where_clauses.append("s.customer_name ILIKE %s")
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
            unit_query = (
                "SELECT model_type, part_number, serial_number, original_serial_number, "
                "first_test_pass, failed_equipment, retest_reason "
                "FROM shipped_units WHERE shipment_id = %s"
            )
            unit_params = [shipment['id']]

            if search_term:
                like_term = f"%{search_term}%"
                # First, try to filter units by the search term
                filtered_unit_query = unit_query + " AND (part_number ILIKE %s OR serial_number ILIKE %s OR original_serial_number ILIKE %s OR model_type ILIKE %s) ORDER BY model_type, part_number"
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)

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
        if cursor:
            cursor.close()
        if conn and not conn.closed:
            conn.close()
