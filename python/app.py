from flask import Flask
from flask_cors import CORS
from blueprint.song import song_bp


app = Flask(__name__)
# 跨域配置
CORS(
    app,
    origins=["http://localhost:5173"],  # 明确允许localhost:5173
    supports_credentials=True,  # 允许携带凭证
    allow_headers=["Content-Type", "Authorization", "token"],  # 允许的请求头
    methods=["GET", "POST", "OPTIONS"],  # 明确允许OPTIONS预检请求
    expose_headers=["Content-Type", "Access-Control-Allow-Origin"],
)  # 预检请求缓存时间，减少OPTIONS请求次数


app.register_blueprint(song_bp)


if __name__ == "__main__":
    app.run(port=8080, debug=True)
