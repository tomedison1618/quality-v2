from psycopg import errors
from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from db import get_db_connection, get_dict_cursor

models_bp = Blueprint('models', __name__)

@models_bp.before_request
def require_editor_role():
    """
    Ensure only admin/user roles can hit any Manage Models endpoint.
    Skip OPTIONS to keep CORS preflight working.
    """
    if request.method == 'OPTIONS':
        return None

    verify_jwt_in_request()
    current_user = get_jwt_identity()
    if not current_user or current_user.get('role') not in ['admin', 'user']:
        return jsonify(msg="Editor or administrator rights required to perform this action."), 403

    return None

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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO model_numbers (model_type, description, part_number) VALUES (%s, %s, %s) RETURNING model_id",
            (model_type, description, part_number)
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Model added successfully', 'id': new_id}), 201
    except errors.UniqueViolation:
        conn.rollback()
        return jsonify({'error': f"Part Number '{part_number}' already exists."}), 409
    except Exception as err:
        conn.rollback()
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)
    
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
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
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
    except errors.UniqueViolation:
        conn.rollback()
        return jsonify({'error': f"Part Number '{data['part_number']}' already exists."}), 409
    except Exception as err:
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

# Note: A DELETE route would follow the same pattern as UPDATE.
# For now, we are using the is_active toggle which is handled by the UPDATE route.

@models_bp.route('/check_part_number', methods=['GET'])
def check_part_number():
    part_number = request.args.get('part_number')
    if not part_number:
        return jsonify({'error': 'Part number is required'}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = get_dict_cursor(conn)
    try:
        cursor.execute("SELECT part_number FROM model_numbers WHERE part_number = %s", (part_number,))
        model = cursor.fetchone()
        if model:
            return jsonify({'exists': True}), 200
        else:
            return jsonify({'exists': False}), 200
    except Exception as err:
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()
