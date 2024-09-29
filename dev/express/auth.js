"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
var better_auth_1 = require("better-auth");
exports.auth = (0, better_auth_1.betterAuth)({
    database: {
        provider: "sqlite",
        url: "./db.sqlite",
    },
});
