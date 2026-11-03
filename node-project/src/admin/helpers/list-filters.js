'use strict';

/**
 * NEW IMPLEMENTATION — NODE.JS PROJECT: client feedback — shared filters for the Sessions and
 * Contests lists: status, date range (IST calendar days) and Latest/Oldest sort.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value) {
  if (!DATE_RE.test(String(value || ''))) return '';
  return Number.isNaN(new Date(`${value}T00:00:00+05:30`).getTime()) ? '' : String(value);
}

/**
 * @param {object} query        req.query
 * @param {string[]} statuses   allowed status values
 * @returns {{status:string, from:string, to:string, sort:'latest'|'oldest', range:object|null, queryString:string}}
 */
function parseListFilters(query, statuses) {
  const status = statuses.includes(query.status) ? query.status : '';
  let from = validDay(query.from);
  let to = validDay(query.to);
  if (from && to && from > to) [from, to] = [to, from];
  const sort = query.sort === 'oldest' ? 'oldest' : 'latest';

  let range = null;
  if (from || to) {
    range = {};
    if (from) range.$gte = new Date(`${from}T00:00:00.000+05:30`);
    if (to) range.$lte = new Date(`${to}T23:59:59.999+05:30`);
  }

  // Everything except page, for pagination links and status tabs.
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (sort !== 'latest') params.set('sort', sort);

  return { status, from, to, sort, range, queryString: params.toString() };
}

/** Same filters with a different status (for the status tabs). */
function withStatus(filters, status) {
  const params = new URLSearchParams(filters.queryString);
  if (status) params.set('status', status); else params.delete('status');
  const qs = params.toString();
  return qs ? `?${qs}` : '?';
}

module.exports = { parseListFilters, withStatus };
