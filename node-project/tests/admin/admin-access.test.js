'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT
 *
 * Feature: Admin User Access Control
 * Covers the permission registry, the route audit (every admin route must carry a
 * permission guard), and end-to-end behaviour of the real admin app with several
 * admins logged in. Mongoose models are replaced by a small in-memory store.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

mongoose.set('bufferCommands', false); // unstubbed DB calls fail fast

const bcrypt = require('bcryptjs');
const request = require('supertest');
const logger = require('../../src/config/logger');
const User = require('../../src/models/user.model');
const AdminRole = require('../../src/models/admin-role.model');
const Setting = require('../../src/models/setting.model');
const permissions = require('../../src/admin/access/permissions');
const accessService = require('../../src/services/admin-access.service');
const { requirePermission } = require('../../src/admin/middleware/permission');
const { requireAdmin } = require('../../src/admin/middleware/auth');
const adminApp = require('../../src/admin/app');

logger.silent = true;

// ─── In-memory store ─────────────────────────────────────────────────────────

const { ObjectId } = mongoose.Types;
const PASSWORD = 'secret123';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const db = { users: [], roles: [], settings: {}, calls: [] };

const same = (a, b) => (a == null && b == null) || String(a) === String(b);
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const val = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && Object.keys(cond).some((k) => k.startsWith('$'))) {
      return Object.entries(cond).every(([op, arg]) => {
        if (op === '$ne') return !same(val, arg);
        if (op === '$in') return arg.some((a) => same(val, a));
        throw new Error(`unsupported operator ${op}`);
      });
    }
    return same(val, cond);
  });
}
function query(value) {
  const promise = Promise.resolve(value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value);
  const q = { select: () => q, lean: () => q, sort: () => q, session: () => q, populate: () => q, then: (a, b) => promise.then(a, b) };
  return q;
}
function applyUpdate(doc, update) {
  const set = update.$set || (update.$unset ? {} : update);
  Object.assign(doc, set);
  Object.keys(update.$unset || {}).forEach((k) => { delete doc[k]; });
}

function model(Model, collection) {
  const find = (f) => db[collection].find((d) => matches(d, f)) || null;
  Model.findById = (id) => query(find({ _id: id }));
  Model.findOne = (f) => {
    const doc = find(f);
    if (doc && collection === 'users') doc.save = async function save() { db.calls.push('User.save'); };
    return query(doc);
  };
  Model.find = (f) => query(db[collection].filter((d) => matches(d, f)).map((d) => ({ ...d })));
  Model.exists = async (f) => (find(f) ? { _id: find(f)._id } : null);
  Model.countDocuments = async (f) => db[collection].filter((d) => matches(d, f)).length;
  Model.create = async (doc) => { const d = { _id: new ObjectId(), ...doc }; db[collection].push(d); db.calls.push(`${Model.modelName}.create`); return d; };
  Model.updateOne = async (f, u) => { const d = find(f); if (d) applyUpdate(d, u); db.calls.push(`${Model.modelName}.updateOne`); return {}; };
  Model.updateMany = async (f, u) => {
    const docs = db[collection].filter((d) => matches(d, f));
    docs.forEach((d) => applyUpdate(d, u));
    return { modifiedCount: docs.length };
  };
  Model.deleteOne = async (f) => { db[collection] = db[collection].filter((d) => !matches(d, f)); db.calls.push(`${Model.modelName}.deleteOne`); };
  Model.deleteMany = async (f) => {
    const before = db[collection].length;
    db[collection] = db[collection].filter((d) => !matches(d, f));
    db.calls.push(`${Model.modelName}.deleteMany`);
    return { deletedCount: before - db[collection].length };
  };
  Model.findByIdAndUpdate = async (id, u) => { const d = find({ _id: id }); if (d) applyUpdate(d, u); db.calls.push(`${Model.modelName}.findByIdAndUpdate`); return d; };
  Model.findByIdAndDelete = async (id) => { db[collection] = db[collection].filter((d) => !same(d._id, id)); db.calls.push(`${Model.modelName}.findByIdAndDelete`); };
  Model.aggregate = async () => [];
}
model(User, 'users');
model(AdminRole, 'roles');
Setting.find = () => ({ lean: async () => Object.entries(db.settings).map(([key, value]) => ({ key, value })) });
Setting.findOneAndUpdate = async (f, doc) => { db.settings[f.key] = doc.value; db.calls.push('Setting.findOneAndUpdate'); return doc; };

const ids = {};
function seed() {
  db.calls = [];
  db.settings = { min_deposit_amount: 100, max_deposit_amount: 50000, min_withdrawal_amount: 500, max_withdrawal_amount: 20000 };
  ids.financeRole = new ObjectId();
  ids.supportRole = new ObjectId();
  db.roles = [
    { _id: ids.financeRole, name: 'Finance', name_key: 'finance', permissions: ['withdrawals.view', 'withdrawals.process', 'deposit_withdrawal_settings.view', 'deposit_withdrawal_settings.edit'] },
    { _id: ids.supportRole, name: 'Support', name_key: 'support', permissions: ['users.view', 'users.create', 'users.edit', 'users.delete'] },
  ];
  const admin = (key, extra) => {
    ids[key] = new ObjectId();
    return { _id: ids[key], name: key, email: `${key}@test.local`, password: HASH, is_admin: true, ...extra };
  };
  db.users = [
    admin('super', { is_super_admin: true }),
    admin('finance', { admin_role_id: ids.financeRole }),
    admin('support', { admin_role_id: ids.supportRole }),
    admin('norole', {}),
    admin('disabled', { admin_role_id: ids.financeRole, admin_status: 'disabled' }),
    { _id: (ids.player = new ObjectId()), name: 'Player', email: 'player@test.local', password: HASH, is_admin: false, deposit_balance: 10 },
  ];
}

async function loginAs(key) {
  const agent = request.agent(adminApp);
  const res = await agent.post('/login').type('form').send({ email: `${key}@test.local`, password: PASSWORD });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard', `login as ${key} failed`);
  return agent;
}
const userById = (id) => db.users.find((u) => same(u._id, id));

// ─── Registry & service ──────────────────────────────────────────────────────

describe('permission registry', () => {
  test('normalizePermissions drops unknown keys and implies module view', () => {
    assert.deepEqual(permissions.normalizePermissions(['users.edit', 'bogus.key', 'users.edit', 'kyc.review']), ['users.view', 'users.edit', 'kyc.view', 'kyc.review']);
    assert.deepEqual(permissions.normalizePermissions('withdrawals.process'), ['withdrawals.view', 'withdrawals.process']);
    assert.deepEqual(permissions.normalizePermissions(undefined), []);
  });

  test('admin user / role management is not grantable through roles', () => {
    assert.ok(!permissions.ALL_PERMISSIONS.some((key) => key.startsWith('admin_')));
  });

  test('requirePermission rejects unknown permission keys at startup', () => {
    assert.throws(() => requirePermission('users.fly'), /Unknown admin permission/);
  });

  test('hasPermission / landingPath', () => {
    const access = { isSuperAdmin: false, permissions: new Set(['withdrawals.view']) };
    assert.equal(accessService.hasPermission(access, 'withdrawals.view'), true);
    assert.equal(accessService.hasPermission(access, ['users.view', 'withdrawals.view']), true);
    assert.equal(accessService.hasPermission(access, 'users.view'), false);
    assert.equal(accessService.hasPermission(null, 'users.view'), false);
    assert.equal(accessService.hasPermission({ isSuperAdmin: true, permissions: new Set() }, 'users.delete'), true);
    assert.equal(accessService.landingPath(access), '/withdrawal_requests');
    assert.equal(accessService.landingPath({ isSuperAdmin: false, permissions: new Set() }), '/profile');
  });
});

describe('admin-access service', () => {
  beforeEach(seed);

  test('loadAdminAccess returns null for disabled, non-admin and missing users', async () => {
    assert.equal(await accessService.loadAdminAccess(ids.disabled), null);
    assert.equal(await accessService.loadAdminAccess(ids.player), null);
    assert.equal(await accessService.loadAdminAccess(new ObjectId()), null);
    const finance = await accessService.loadAdminAccess(ids.finance);
    assert.equal(finance.roleName, 'Finance');
    assert.ok(finance.permissions.has('withdrawals.process'));
    const norole = await accessService.loadAdminAccess(ids.norole);
    assert.equal(norole.permissions.size, 0);
  });

  test('checkAdminAccountChange protects self and the last active super admin', async () => {
    const superAdmin = userById(ids.super);
    assert.match(await accessService.checkAdminAccountChange({ actorId: ids.super, target: superAdmin, next: { admin_status: 'disabled' } }), /your own/);
    assert.match(await accessService.checkAdminAccountChange({ actorId: ids.super, target: superAdmin, next: { is_super_admin: false } }), /your own/);
    assert.match(await accessService.checkAdminAccountChange({ actorId: ids.finance, target: superAdmin, next: { deleted: true } }), /At least one active super admin/);

    userById(ids.norole).is_super_admin = true; // a second active super admin now exists
    assert.equal(await accessService.checkAdminAccountChange({ actorId: ids.norole, target: superAdmin, next: { is_admin: false } }), null);
    assert.equal(await accessService.checkAdminAccountChange({ actorId: ids.super, target: userById(ids.finance), next: { admin_status: 'disabled' } }), null);
  });

  test('bootstrapSuperAdmins promotes existing admins only when no super admin exists', async () => {
    assert.equal(await accessService.bootstrapSuperAdmins(), 0);
    db.users.forEach((u) => { u.is_super_admin = false; });
    assert.equal(await accessService.bootstrapSuperAdmins(), 5);
    assert.equal(userById(ids.player).is_super_admin, false);
    assert.equal(await accessService.bootstrapSuperAdmins(), 0);
  });
});

// ─── Route audit ─────────────────────────────────────────────────────────────

describe('route audit', () => {
  const OWN_ACCOUNT_ROUTES = new Set(['GET /profile', 'GET /profile/show', 'PUT /profile', 'PUT /password']);

  function collectRoutes(stack, out = []) {
    stack.forEach((layer) => {
      if (layer.route) {
        Object.keys(layer.route.methods).forEach((method) => {
          out.push({ id: `${method.toUpperCase()} ${layer.route.path}`, handles: layer.route.stack.map((l) => l.handle) });
        });
      } else if (layer.handle && layer.handle.stack) {
        collectRoutes(layer.handle.stack, out);
      }
    });
    return out;
  }

  test('every admin-protected route also checks a permission', () => {
    const routes = collectRoutes(adminApp._router.stack);
    assert.ok(routes.length > 150, `expected the full route table, found ${routes.length}`);
    const unguarded = routes
      .filter((r) => r.handles.includes(requireAdmin))
      .filter((r) => !r.handles.some((h) => h.permissions || h.superAdminOnly))
      .map((r) => r.id)
      .filter((id) => !OWN_ACCOUNT_ROUTES.has(id));
    assert.deepEqual(unguarded, []);
  });

  test('routes without requireAdmin are only login, logout and the root redirect', () => {
    const open = collectRoutes(adminApp._router.stack).filter((r) => !r.handles.includes(requireAdmin)).map((r) => r.id);
    assert.deepEqual([...new Set(open)].sort(), ['GET /', 'GET /login', 'GET /logout', 'POST /login', 'POST /logout']);
  });
});

// ─── End-to-end through the admin app ────────────────────────────────────────

describe('feature access enforcement', () => {
  beforeEach(seed);

  test('an admin can use the modules in their role', async () => {
    const finance = await loginAs('finance');
    const read = await finance.get('/deposit-withdrawal-settings/data');
    assert.equal(read.status, 200);
    const save = await finance.post('/deposit-withdrawal-settings').set('Accept', 'application/json')
      .send({ min_deposit_amount: '200', max_deposit_amount: '40000', min_withdrawal_amount: '500', max_withdrawal_amount: '20000' });
    assert.equal(save.status, 200, save.text);
    assert.equal(db.settings.min_deposit_amount, 200);
  });

  test('an admin is blocked from modules outside their role, with nothing changed', async () => {
    const finance = await loginAs('finance');
    const page = await finance.get('/users');
    assert.equal(page.status, 403);
    assert.match(page.text, /Access Denied/);

    const bulk = await finance.post('/users/bulk-delete').type('form').send({ user_ids: JSON.stringify([String(ids.player)]) });
    assert.equal(bulk.status, 403);
    assert.ok(userById(ids.player), 'player must not be deleted');

    const api = await finance.get('/api/users/search?q=a');
    assert.equal(api.status, 403);
    assert.equal(api.body.success, false);
    assert.ok(!db.calls.some((c) => c.includes('delete') || c.includes('Delete')));
  });

  test('view permission alone does not allow actions', async () => {
    db.roles.find((r) => same(r._id, ids.financeRole)).permissions = ['deposit_withdrawal_settings.view'];
    const finance = await loginAs('finance');
    assert.equal((await finance.get('/deposit-withdrawal-settings/data')).status, 200);
    const save = await finance.post('/deposit-withdrawal-settings').set('Accept', 'application/json').send({ min_deposit_amount: '1' });
    assert.equal(save.status, 403);
    assert.equal(db.settings.min_deposit_amount, 100);
  });

  test('admins without the dashboard are sent to their first allowed page', async () => {
    const finance = await loginAs('finance');
    const res = await finance.get('/dashboard');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/withdrawal_requests');

    const norole = await loginAs('norole');
    const res2 = await norole.get('/dashboard');
    assert.equal(res2.headers.location, '/profile');
    assert.equal((await norole.get('/withdrawal_requests')).status, 403);
  });

  test('only super admins can open admin user and role management', async () => {
    const finance = await loginAs('finance');
    for (const path of ['/admin-users', '/admin-users/create', '/admin-roles', '/admin-roles/create']) {
      assert.equal((await finance.get(path)).status, 403, path);
    }
    const create = await finance.post('/admin-roles').type('form').send({ name: 'Sneaky', permissions: ['users.delete'] });
    assert.equal(create.status, 403);
    assert.equal(db.roles.length, 2);

    const superAdmin = await loginAs('super');
    assert.equal((await superAdmin.get('/admin-roles/create')).status, 200);
    assert.equal((await superAdmin.get('/admin-users/create')).status, 200);
  });

  test('sidebar shows only permitted modules; admin access section only for super admins', async () => {
    const finance = await loginAs('finance');
    const page = await finance.get('/users'); // 403 page is rendered inside the normal layout
    assert.match(page.text, /href="\/withdrawal_requests"/);
    assert.match(page.text, /href="\/deposit-withdrawal-settings"/);
    assert.doesNotMatch(page.text, /href="\/users"/);
    assert.doesNotMatch(page.text, /href="\/admin-users"/);
    assert.match(page.text, /Finance/); // role shown in header

    const superAdmin = await loginAs('super');
    const list = await superAdmin.get('/admin-users');
    assert.equal(list.status, 200);
    assert.match(list.text, /href="\/admin-users"/);
    assert.match(list.text, /No role — no access/); // the role-less admin is flagged
    assert.match(list.text, /href="\/users"/);
    assert.equal((await superAdmin.get('/admin-roles')).status, 200);
    assert.equal((await superAdmin.get(`/admin-roles/${ids.financeRole}/edit`)).status, 200);
  });

  test('disabled admins cannot log in', async () => {
    const res = await request(adminApp).post('/login').type('form').send({ email: 'disabled@test.local', password: PASSWORD });
    assert.equal(res.headers.location, '/login');
  });
});

describe('access changes apply to live sessions', () => {
  beforeEach(seed);

  test('editing a role changes what its logged-in admins can do on the next request', async () => {
    const finance = await loginAs('finance');
    const superAdmin = await loginAs('super');
    assert.equal((await finance.get('/deposit-withdrawal-settings/data')).status, 200);

    const res = await superAdmin.post(`/admin-roles/${ids.financeRole}?_method=PUT`).type('form')
      .send({ name: 'Finance', description: '', permissions: ['withdrawals.view'] });
    assert.equal(res.status, 302, res.text);

    assert.equal((await finance.get('/deposit-withdrawal-settings/data')).status, 403);
  });

  test('disabling an admin ends their session immediately', async () => {
    const finance = await loginAs('finance');
    const superAdmin = await loginAs('super');
    await superAdmin.post(`/admin-users/${ids.finance}/status`);
    assert.equal(userById(ids.finance).admin_status, 'disabled');

    const res = await finance.get('/withdrawal_requests');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login');
  });
});

describe('admin users & roles management', () => {
  beforeEach(seed);

  test('super admin creates an admin user with a role; password is hashed', async () => {
    const superAdmin = await loginAs('super');
    const res = await superAdmin.post('/admin-users').type('form').send({
      name: 'Reports Person', email: 'Reports@Test.local', password: 'longpassword', password_confirmation: 'longpassword',
      access_level: String(ids.supportRole), admin_status: 'active',
    });
    assert.equal(res.status, 302, res.text);
    const created = db.users.find((u) => u.email === 'reports@test.local');
    assert.ok(created);
    assert.equal(created.is_admin, true);
    assert.equal(created.is_super_admin, false);
    assert.ok(same(created.admin_role_id, ids.supportRole));
    assert.ok(bcrypt.compareSync('longpassword', created.password));
    assert.ok(!('mobile' in created), 'empty mobile must be omitted (sparse unique index)');
  });

  test('admin user form rejects invalid input', async () => {
    const superAdmin = await loginAs('super');
    const before = db.users.length;
    const res = await superAdmin.post('/admin-users').type('form').send({
      name: '', email: 'finance@test.local', password: 'short', access_level: 'not-a-role',
    });
    assert.equal(res.status, 422);
    assert.match(res.text, /already used/);
    assert.match(res.text, /at least 8/);
    assert.match(res.text, /Choose a role/);
    assert.equal(db.users.length, before);
  });

  test('super admin cannot disable, demote or revoke themselves', async () => {
    const superAdmin = await loginAs('super');
    await superAdmin.post(`/admin-users/${ids.super}/status`);
    await superAdmin.post(`/admin-users/${ids.super}?_method=DELETE`);
    const demote = await superAdmin.post(`/admin-users/${ids.super}?_method=PUT`).type('form')
      .send({ name: 'super', email: 'super@test.local', access_level: String(ids.financeRole), admin_status: 'active' });
    assert.equal(demote.status, 422);
    const me = userById(ids.super);
    assert.equal(me.is_admin, true);
    assert.equal(me.is_super_admin, true);
    assert.notEqual(me.admin_status, 'disabled');
  });

  test('role permissions are normalised and roles in use cannot be deleted', async () => {
    const superAdmin = await loginAs('super');
    await superAdmin.post('/admin-roles').type('form').send({ name: 'KYC Desk', permissions: ['kyc.review', 'made.up'] });
    const role = db.roles.find((r) => r.name === 'KYC Desk');
    assert.deepEqual(role.permissions, ['kyc.view', 'kyc.review']);

    const dup = await superAdmin.post('/admin-roles').type('form').send({ name: 'kyc desk', permissions: ['kyc.view'] });
    assert.equal(dup.status, 422);

    await superAdmin.post(`/admin-roles/${ids.financeRole}?_method=DELETE`);
    assert.ok(db.roles.find((r) => same(r._id, ids.financeRole)), 'assigned role must not be deleted');
    await superAdmin.post(`/admin-roles/${role._id}?_method=DELETE`);
    assert.ok(!db.roles.find((r) => same(r._id, role._id)));
  });
});

describe('Players module cannot be used to escalate privileges', () => {
  beforeEach(seed);

  test('a non-super admin cannot edit, delete or adjust an admin account', async () => {
    const support = await loginAs('support');
    const originalHash = userById(ids.super).password;

    const edit = await support.post(`/users/${ids.super}?_method=PUT`).type('form')
      .send({ name: 'pwned', email: 'super@test.local', password: 'newpassword1' });
    assert.equal(edit.status, 302);
    assert.equal(userById(ids.super).password, originalHash);
    assert.equal(userById(ids.super).name, 'super');

    await support.post(`/users/${ids.super}?_method=DELETE`);
    assert.ok(userById(ids.super));

    await support.post('/users/bulk-delete').type('form').send({ user_ids: JSON.stringify([String(ids.super), String(ids.player)]) });
    assert.ok(userById(ids.super), 'admin accounts are skipped by bulk delete');
    assert.equal(userById(ids.player), undefined, 'players are still deleted');
  });

  test('a non-super admin cannot grant is_admin', async () => {
    const support = await loginAs('support');
    await support.post('/users').type('form').send({
      name: 'New', email: 'new@test.local', password: 'password123', password_confirmation: 'password123', is_admin: '1',
    });
    assert.equal(db.users.find((u) => u.email === 'new@test.local').is_admin, false);

    await support.post(`/users/${ids.player}?_method=PUT`).type('form').send({ name: 'Player', email: 'player@test.local', is_admin: '1' });
    assert.equal(userById(ids.player).is_admin, false);
  });

  test('a super admin can still grant admin access from Players', async () => {
    const superAdmin = await loginAs('super');
    await superAdmin.post(`/users/${ids.player}?_method=PUT`).type('form').send({ name: 'Player', email: 'player@test.local', is_admin: '1' });
    assert.equal(userById(ids.player).is_admin, true);
  });
});
