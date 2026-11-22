// スパイク用の GitHub GraphQL モック。variables.user に応じて fixtures を返す
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const fixture = (name) => readFileSync(new URL(`../../fixtures/${name}.json`, import.meta.url));
createServer((req, res) => {
	let body = "";
	req.on("data", (c) => (body += c));
	req.on("end", () => {
		const user = JSON.parse(body || "{}").variables?.user;
		res.writeHead(200, { "content-type": "application/json" });
		res.end(fixture(user === "swfz" ? "default" : "not-found"));
	});
}).listen(8000, () => console.log("mock github on 8000"));
