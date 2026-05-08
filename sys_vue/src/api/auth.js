/**
 * QQ 音乐登录认证 API
 */
import axios from "axios";

const authClient = axios.create({
	baseURL: "http://localhost:9752/api/v1/auth",
	timeout: 30000,
	headers: { "Content-Type": "application/json" },
});

authClient.interceptors.response.use(
	(response) => {
		const res = response.data;
		if (res.code === 0) return res;
		return Promise.reject(new Error(res.message || "请求失败"));
	},
	(error) => Promise.reject(error),
);

export function getLoginStatus() {
	return authClient.get("/status");
}

export function createQRCode(loginType = "qq") {
	return authClient.post("/qrcode", { login_type: loginType });
}

export function checkQRCode(sessionId) {
	return authClient.get("/check", { params: { session_id: sessionId } });
}

export function logout() {
	return authClient.post("/logout");
}
