from flask import Blueprint, request, jsonify
from db import get_db_connection
# --- IMPORT FROM THE NEW DECORATORS FILE ---
from routes.auth_decorators import editor_access_required

checklist_bp = Blueprint('checklist', __name__)

@checklist_bp.route('/items', methods=['GET'])
def get_master_items():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
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
    cursor = conn.cursor()
    query = """
    INSERT INTO shipment_checklist_responses (shipment_id, item_id, status, completed_by, completion_date, comments)
    VALUES (%s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
    status = VALUES(status), completed_by = VALUES(completed_by), completion_date = VALUES(completion_date), comments = VALUES(comments)
    """
    try:
        cursor.execute(query, (shipment_id, item_id, status, completed_by, completion_date, comments))
        conn.commit()
        return jsonify({'message': 'Response saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()