from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

def editor_access_required(fn):
    """
    A decorator to protect routes that require editor-level access.
    Allows 'admin' and 'user' roles, but blocks 'viewer'.
    """
    @wraps(fn)
    @jwt_required() # Ensures a valid token is present first
    def wrapper(*args, **kwargs):
        current_user = get_jwt_identity()
        if current_user and current_user.get('role') in ['admin', 'user']:
            return fn(*args, **kwargs)
        else:
            return jsonify(msg="Editor or administrator rights required to perform this action."), 403
    return wrapper

def admin_required(fn):
    """
    A decorator to protect routes that require full admin access.
    """
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        current_user = get_jwt_identity()
        if current_user and current_user.get('role') == 'admin':
            return fn(*args, **kwargs)
        else:
            return jsonify(msg="Administrator rights required."), 403
    return wrapper