"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const{normalizeEmail,isValidEmail,htmlEscape,otpHash,safeStringEqual,hashPassword,verifyPassword,generateOtp,hashSessionToken,adminEmailsFromEnv}=require("../src/security");
test("email normalization and validation",()=>{assert.equal(normalizeEmail(" PERSON@Example.COM "),"person@example.com");assert.equal(isValidEmail("person@example.com"),true);assert.equal(isValidEmail("no-at.example.com"),false);});
test("HTML is escaped",()=>assert.equal(htmlEscape('<img src=x onerror="alert(1)">'),"&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
test("OTP hash is address, code and purpose scoped",()=>{const k="some-test-pepper-at-least-32-characters-long";const h=otpHash("A@Example.com","123456",k,"registration");assert.equal(h,otpHash("a@example.com","123456",k,"registration"));assert.notEqual(h,otpHash("a@example.com","123456",k,"password-reset"));assert.notEqual(h,otpHash("a@example.com","123457",k,"registration"));assert.equal(safeStringEqual(h,h),true);assert.equal(safeStringEqual(h,h+"x"),false);});
test("password hash is salted and verified",async()=>{const p="A sample password longer than twelve characters!";const h=await hashPassword(p);assert.equal(await verifyPassword(p,h),true);assert.equal(await verifyPassword("wrong password",h),false);assert.notEqual(h,await hashPassword(p));});
test("OTP has six digits",()=>{for(let i=0;i<50;i++)assert.match(generateOtp(),/^\d{6}$/);});
test("session token HMAC is keyed and rejects a missing secret",()=>{const token="random session token",a="session-secret-at-least-32-random-characters",b="another-session-secret-at-least-32-random-chars";assert.match(hashSessionToken(token,a),/^[a-f0-9]{64}$/);assert.notEqual(hashSessionToken(token,a),hashSessionToken(token,b));assert.throws(()=>hashSessionToken(token),/SESSION_SECRET/);});
test("admin emails normalize",()=>assert.deepEqual(adminEmailsFromEnv(" ADMIN@Example.com,nope,other@example.org "),["admin@example.com","other@example.org"]));

test("SQL migration keeps function delimiters balanced and supports schema upgrades", function () {
 const fs = require("node:fs");
 const path = require("node:path");
 const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "001_teampeach.sql"), "utf8");
 const fnCount = (sql.match(/create (?:or replace )?function/g) || []).length;
 const delimiterCount = sql.split("$$").length - 1;
 assert.equal(fnCount, 7);
 assert.equal(delimiterCount, fnCount * 2);
 assert.equal((sql.match(/language plpgsql[\s\S]*?as \$\$/g) || []).length, fnCount);
 assert.match(sql, /add column if not exists skipped_count/i);
 assert.match(sql, /tp_email_queue_status_check/);
 assert.match(sql, /tp_claim_broadcast_jobs/);
 assert.match(sql, /tp_consume_rate_limit/);
 assert.match(sql, /create table if not exists public\.tp_rate_limits/);
});
