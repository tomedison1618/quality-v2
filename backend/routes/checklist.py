from flask import Blueprint, request, jsonify
from db import get_db_connection, get_dict_cursor
# --- IMPORT FROM THE NEW DECORATORS FILE ---
from routes.auth_decorators import editor_access_required, admin_required

checklist_bp = Blueprint('checklist', __name__)

@checklist_bp.route('/items', methods=['GET'])
def get_master_items():
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)
    cursor.execute(
        "SELECT item_id, item_text FROM checklist_master_items WHERE is_active = TRUE ORDER BY item_order"
    )
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(items)

@checklist_bp.route('/responses', methods=['POST'])
@checklist_bp.route('/responses/', methods=['POST'])
@editor_access_required
def save_response():
    data = request.get_json()
    shipment_id = data.get('shipment_id')
    item_id = data.get('item_id')
    status = data.get('status')
    completed_by = data.get('completed_by')
    completion_date = data.get('completion_date')
    comments = data.get('comments', None)

    if not all([shipment_id, item_id, status, completed_by, completion_date]):
        return jsonify({'error': 'Missing required fields'}), 400
    if status not in ['Passed', 'NA']:
        return jsonify({'error': "Status must be 'Passed' or 'NA'"}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    query = """
    INSERT INTO shipment_checklist_responses (shipment_id, item_id, status, completed_by, completion_date, comments)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON CONFLICT (shipment_id, item_id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_by = EXCLUDED.completed_by,
        completion_date = EXCLUDED.completion_date,
        comments = EXCLUDED.comments
    """
    try:
        cursor.execute(query, (shipment_id, item_id, status, completed_by, completion_date, comments))
        conn.commit()
        return jsonify({'message': 'Response saved successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@checklist_bp.route('/items/manage', methods=['GET'])
@admin_required
def get_all_master_items():
    """
    Retrieve the full checklist, including inactive rows, for the admin UI.
    """
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = get_dict_cursor(conn)
    cursor.execute(
        "SELECT item_id, item_text, item_order, is_active FROM checklist_master_items ORDER BY item_order"
    )
    items = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(items)


@checklist_bp.route('/items', methods=['POST'])
@admin_required
def create_master_item():
    data = request.get_json() or {}
    item_text = data.get('item_text')
    item_order = data.get('item_order')
    is_active = data.get('is_active', True)

    if not item_text:
        return jsonify({'error': 'Checklist item text is required.'}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor()
    try:
        if item_order is None:
            cursor.execute("SELECT COALESCE(MAX(item_order), 0) + 10 FROM checklist_master_items")
            item_order = cursor.fetchone()[0]

        cursor.execute(
            "INSERT INTO checklist_master_items (item_text, item_order, is_active) VALUES (%s, %s, %s) RETURNING item_id",
            (item_text, item_order, is_active)
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Checklist item created successfully.', 'item_id': new_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@checklist_bp.route('/items/<int:item_id>', methods=['PUT'])
@admin_required
def update_master_item(item_id):
    data = request.get_json() or {}
    item_text = data.get('item_text')
    item_order = data.get('item_order')
    is_active = data.get('is_active')

    if not item_text or item_order is None or is_active is None:
        return jsonify({'error': 'Item text, order, and active status are required.'}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE checklist_master_items
            SET item_text = %s, item_order = %s, is_active = %s
            WHERE item_id = %s
            """,
            (item_text, item_order, is_active, item_id)
        )
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'error': 'Checklist item not found.'}), 404
        conn.commit()
        return jsonify({'message': 'Checklist item updated successfully.'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@checklist_bp.route('/items/<int:item_id>', methods=['DELETE'])
@admin_required
def delete_master_item(item_id):
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500

    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM checklist_master_items WHERE item_id = %s", (item_id,))
        if cursor.rowcount == 0:
            conn.rollback()
            return jsonify({'error': 'Checklist item not found.'}), 404
        conn.commit()
        return jsonify({'message': 'Checklist item deleted successfully.'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()
