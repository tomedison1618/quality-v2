from psycopg import errors
from flask import Blueprint, request, jsonify
from db import get_db_connection
# --- IMPORT FROM THE NEW DECORATORS FILE ---
from routes.auth_decorators import editor_access_required, jwt_required

units_bp = Blueprint('units', __name__)

@units_bp.route('', methods=['POST'])
@units_bp.route('/', methods=['POST'])
@editor_access_required
def add_unit():
    data = request.get_json()
    shipment_id = data.get('shipment_id')
    model_type = data.get('model_type')
    part_number = data.get('part_number')
    serial_number = data.get('serial_number')
    first_test_pass = data.get('first_test_pass', True)
    failed_equipment = data.get('failed_equipment', None) if not first_test_pass else None
    retest_reason = data.get('retest_reason', None) if not first_test_pass else None
    original_serial_number = data.get('original_serial_number')
    if original_serial_number == '':
        original_serial_number = None

    if not all([shipment_id, model_type, part_number, serial_number]):
        return jsonify({'error': 'Missing required fields'}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        print(f"DEBUG: Inserting unit: shipment_id={shipment_id}, model_type={model_type}, part_number={part_number}, serial_number={serial_number}, original_serial_number={original_serial_number}, first_test_pass={first_test_pass}, failed_equipment={failed_equipment}, retest_reason={retest_reason}")
        cursor.execute(
            """
            INSERT INTO shipped_units (shipment_id, model_type, part_number, serial_number, original_serial_number, first_test_pass, failed_equipment, retest_reason)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING unit_id
            """,
            (shipment_id, model_type, part_number, serial_number, original_serial_number, first_test_pass, failed_equipment, retest_reason)
        )
        new_id = cursor.fetchone()[0]
        conn.commit()
        return jsonify({'message': 'Unit added successfully', 'id': new_id}), 201
    except errors.UniqueViolation as err:
        conn.rollback()
        constraint = (getattr(err.diag, "constraint_name", "") or "").lower()
        if 'serial_number' in constraint:
            return jsonify({'error': f"Serial Number '{serial_number}' already exists."}), 409
        if 'original_serial_number' in constraint:
            return jsonify({'error': f"Original Serial Number '{original_serial_number}' already exists."}), 409
        return jsonify({'error': 'Unique constraint violated'}), 409
    except Exception as err:
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

# Note: check-serial is a read-only operation, so it only needs a valid login, not a specific role.
@units_bp.route('/check-serial', methods=['GET'])
@jwt_required()
def check_serial():
    serial_number = request.args.get('serial_number')
    if not serial_number:
        return jsonify({'error': 'Serial number is required'}), 400

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT unit_id FROM shipped_units WHERE serial_number = %s", (serial_number,))
        result = cursor.fetchone()
    finally:
        cursor.close()
        conn.close()

    is_unique = result is None
    return jsonify({'is_unique': is_unique})

@units_bp.route('/<int:unit_id>', methods=['PUT'])
@editor_access_required
def update__unit(unit_id):
    data = request.get_json()
    original_serial_number = data.get('original_serial_number')
    if original_serial_number == '':
        original_serial_number = None

    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            UPDATE shipped_units SET
            model_type = %s, part_number = %s, serial_number = %s, original_serial_number = %s,
            first_test_pass = %s, failed_equipment = %s, retest_reason = %s
            WHERE unit_id = %s
            """,
            (
                data['model_type'], data['part_number'], data['serial_number'], original_serial_number,
                data['first_test_pass'], data.get('failed_equipment'), data.get('retest_reason'), unit_id
            )
        )
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Unit not found'}), 404
        return jsonify({'message': 'Unit updated successfully'}), 200
    except errors.UniqueViolation as err:
        conn.rollback()
        constraint = (getattr(err.diag, "constraint_name", "") or "").lower()
        if 'serial_number' in constraint:
            return jsonify({'error': f"Serial Number '{data['serial_number']}' already exists."}), 409
        if 'original_serial_number' in constraint:
            return jsonify({'error': f"Original Serial Number '{original_serial_number}' already exists."}), 409
        return jsonify({'error': 'Unique constraint violated'}), 409
    except Exception as err:
        conn.rollback()
        return jsonify({'error': str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@units_bp.route('/<int:unit_id>', methods=['DELETE'])
@editor_access_required
def delete_unit(unit_id):
    conn = get_db_connection()
    if conn is None:
        return jsonify({'error': 'Database connection failed'}), 500
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM shipped_units WHERE unit_id = %s", (unit_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({'error': 'Unit not found'}), 404
        return jsonify({'message': 'Unit deleted successfully'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()
