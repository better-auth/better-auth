"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var node_1 = require("better-auth/node");
var auth_js_1 = require("./auth.js");
var app = (0, express_1.default)();
var port = 3005;
app.get("/api/auth/*", (0, node_1.toNodeHandler)(auth_js_1.auth));
app.listen(port, function () {
    console.log("Example app listening on port ".concat(port));
});
