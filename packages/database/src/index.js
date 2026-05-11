"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.PrismaClient = void 0;
var client_1 = require("@prisma/client");
Object.defineProperty(exports, "PrismaClient", { enumerable: true, get: function () { return client_1.PrismaClient; } });
var client_2 = require("./client");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return client_2.db; } });
//# sourceMappingURL=index.js.map