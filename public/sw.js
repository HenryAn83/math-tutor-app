// 홈 화면에 추가할 수 있게 하는 최소한의 서비스 워커. 아무것도 저장(캐시)하지 않는다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
