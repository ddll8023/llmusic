class Result:
    @staticmethod
    def result_success(msg: str = "success", code: int = 200, data: dict = None):
        return Result._generate_result(msg, code, data)

    @staticmethod
    def result_fail(msg: str = "fail", code: int = 400, data: dict = None):
        return Result._generate_result(msg, code, data)

    @staticmethod
    def _generate_result(msg: str, code: int, data: dict):
        return {"code": code, "msg": msg, "data": data}
