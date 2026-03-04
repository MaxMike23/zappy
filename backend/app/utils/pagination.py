from flask import request


def paginate(query, default_per_page=25, max_per_page=100):
    """
    Applies pagination to a SQLAlchemy query using ?page=&per_page= query params.
    Returns a dict with items (serialized by the caller) and pagination metadata.

    Usage in a route:
        result = paginate(Project.query.filter_by(company_id=company_id))
        result["items"] = [p.to_dict() for p in result["items"]]
        return jsonify(result), 200
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(
        request.args.get("per_page", default_per_page, type=int),
        max_per_page,
    )

    paginated = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        "items": paginated.items,
        "pagination": {
            "page": paginated.page,
            "per_page": paginated.per_page,
            "total": paginated.total,
            "pages": paginated.pages,
            "has_next": paginated.has_next,
            "has_prev": paginated.has_prev,
        },
    }
