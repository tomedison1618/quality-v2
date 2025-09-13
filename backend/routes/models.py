from flask import Blueprint, request, jsonify
from db import get_db_connection

models_bp = Blueprint('models', __name__)

# [CREATE] Add a new model
# THE FIX: Stacked decorators to handle both '/models' and '/models/'
@models_bp.route('', methods=['POST'])
@models_bp.route('/', methods=['POST'])
def add_model():
    data = request.get_json()
    model_type = data.get('model_type')
    part_number = data.get('part_number')
    description = data.get('description', None)

    if not model_type or not part_number:
        return jsonify({'error': 'Model Type and Part Number are required.'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO model_numbers (model_type, description, part_number) VALUES (%s, %s, %s)",
            (model_type, description, part_number)
        )
        conn.commit()
        return jsonify({'message': 'Model added successfully', 'id': cursor.lastrowid}), 201
    except conn.connector.Error as err:
        if err.errno == 1062: # Duplicate entry for part_number
            return jsonify({'error': f"Part Number '{part_number}' already exists."}), 409
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()


# [READ] Get all models
# THE FIX: Stacked decorators to handle both '/models' and '/models/'
@models_bp.route('', methods=['GET'])
@models_bp.route('/', methods=['GET'])
def get_models():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    # Select all fields, including the new description
    cursor.execute("SELECT model_id, model_type, description, part_number, is_active FROM model_numbers ORDER BY model_type, part_number")
    models = cursor.fetchall()

    # Get distinct model types for dropdowns
    cursor.execute("SELECT DISTINCT model_type FROM model_numbers WHERE is_active = TRUE ORDER BY model_type")
    model_types = [row['model_type'] for row in cursor.fetchall()]

    cursor.close()
    conn.close()
    return jsonify({'all_models': models, 'model_types': model_types})


# [UPDATE] Update a model
# Note: Routes with parameters like <model_id> are NOT affected by the trailing slash issue.
@models_bp.route('/<int:model_id>', methods=['PUT'])
def update_model(model_id):
    data = request.get_json()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE model_numbers SET model_type = %s, description = %s, part_number = %s, is_active = %s WHERE model_id = %s",
            (data['model_type'], data['description'], data['part_number'], data['is_active'], model_id)
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Model not found'}), 404
        return jsonify({'message': 'Model updated successfully'}), 200
    except conn.connector.Error as err:
        if err.errno == 1062: # Duplicate entry for part_number
            return jsonify({'error': f"Part Number '{data['part_number']}' already exists."}), 409
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

# Note: A DELETE route would follow the same pattern as UPDATE.
# For now, we are using the is_active toggle which is handled by the UPDATE route.