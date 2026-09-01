// Supabase data layer for ajiltan.html (Employee Info pilot).
// Scope: ONLY the employee registry + monthly scoreboard for this one page.
// Do not reuse for other pages/projects.
//
// Multi-project note: every shared link is ?id=<project_id>. All reads/writes
// are scoped to that project_id; RLS on the Supabase side additionally
// requires the project_id to exist in the `projects` table and be active.
(function () {
  'use strict';

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || !window.supabase) {
    console.error('Supabase is not configured. Check supabaseConfig.js and the supabase-js <script> include.');
    return;
  }

  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const LEGACY_EMPLOYEES_KEY = 'ubtz-employee-registry';
  const LEGACY_SCOREBOARD_KEY = 'ubtz-employee-scoreboard';
  const MIGRATION_DONE_FLAG_PREFIX = 'ubtz-supabase-migration-done-';

  function getProjectIdFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('id');
    return raw ? raw.trim() : null;
  }

  // Returns the project row if projectId exists and is active, otherwise null.
  async function fetchProject(projectId) {
    const { data, error } = await client
      .from('projects')
      .select('id, name, is_active')
      .eq('id', projectId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.is_active === false) return null;
    return data;
  }

  function rowToEmployee(row) {
    return {
      id: row.id,
      projectId: row.project_id,
      scoreKey: row.legacy_score_key || row.id,
      rd: row.rd || '',
      last: row.last_name || '',
      first: row.first_name || '',
      age: row.age,
      phone: row.phone || '',
      email: row.email || '',
      emergencyPhone: row.emergency_phone || '',
      job: row.job || '',
      gender: row.gender || 'Эр',
      edu: row.edu || '',
      kids: row.kids,
      place: row.place || '',
      address: row.address || '',
      bloodType: row.blood_type || '',
      clothesSize: row.clothes_size || '',
      uniformSize: row.uniform_size || '',
      awards: row.awards || '',
      penalties: row.penalties || '',
      skills: row.skills || '',
      railYears: row.rail_years || ''
    };
  }

  function employeeToRow(emp, projectId) {
    return {
      project_id: projectId,
      legacy_score_key: emp.scoreKey || null,
      rd: emp.rd || null,
      last_name: emp.last || null,
      first_name: emp.first || null,
      age: Number.isFinite(emp.age) ? emp.age : null,
      phone: emp.phone || null,
      email: emp.email || null,
      emergency_phone: emp.emergencyPhone || null,
      job: emp.job || null,
      gender: emp.gender || null,
      edu: emp.edu || null,
      kids: Number.isFinite(emp.kids) ? emp.kids : null,
      place: emp.place || null,
      address: emp.address || null,
      blood_type: emp.bloodType || null,
      clothes_size: emp.clothesSize || null,
      uniform_size: emp.uniformSize || null,
      awards: emp.awards || null,
      penalties: emp.penalties || null,
      skills: emp.skills || null,
      rail_years: emp.railYears !== undefined && emp.railYears !== null ? String(emp.railYears) : null
    };
  }

  async function fetchEmployees(projectId) {
    const { data, error } = await client
      .from('employees')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToEmployee);
  }

  async function fetchScores(year, projectId) {
    const { data, error } = await client
      .from('employee_scores')
      .select('employee_id, month_index, score')
      .eq('year', year)
      .eq('project_id', projectId);
    if (error) throw error;
    return data || [];
  }

  async function insertEmployee(emp, projectId) {
    const { data, error } = await client
      .from('employees')
      .insert(employeeToRow(emp, projectId))
      .select()
      .single();
    if (error) throw error;
    return rowToEmployee(data);
  }

  async function updateEmployee(id, emp, projectId) {
    const { data, error } = await client
      .from('employees')
      .update(employeeToRow(emp, projectId))
      .eq('id', id)
      .eq('project_id', projectId)
      .select()
      .single();
    if (error) throw error;
    return rowToEmployee(data);
  }

  async function deleteEmployee(id, projectId) {
    const { error } = await client
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('project_id', projectId);
    if (error) throw error;
  }

  async function upsertScore(employeeId, year, monthIndex, score, projectId) {
    if (score === null || score === undefined) {
      const { error } = await client
        .from('employee_scores')
        .delete()
        .eq('employee_id', employeeId)
        .eq('year', year)
        .eq('month_index', monthIndex)
        .eq('project_id', projectId);
      if (error) throw error;
      return;
    }
    const { error } = await client
      .from('employee_scores')
      .upsert(
        { project_id: projectId, employee_id: employeeId, year: year, month_index: monthIndex, score: score },
        { onConflict: 'employee_id,year,month_index' }
      );
    if (error) throw error;
  }

  async function upsertEmployeeByLegacyKey(emp, projectId) {
    const payload = employeeToRow(emp, projectId);
    const { data, error } = await client
      .from('employees')
      .upsert(payload, { onConflict: 'project_id,legacy_score_key' })
      .select()
      .single();
    if (error) throw error;
    return rowToEmployee(data);
  }

  function hasLegacyData() {
    return !!(localStorage.getItem(LEGACY_EMPLOYEES_KEY) || localStorage.getItem(LEGACY_SCOREBOARD_KEY));
  }

  function isMigrationDone(projectId) {
    return localStorage.getItem(MIGRATION_DONE_FLAG_PREFIX + projectId) === 'true';
  }

  // Reads existing LocalStorage data (from the pre-multi-project version of
  // this page) and uploads it into the given projectId. Does NOT delete
  // LocalStorage data. Safe to re-run (dedupes by project_id+legacy_score_key).
  async function migrateLocalStorageToSupabase(projectId) {
    const report = { employeesOk: 0, employeesFail: 0, scoresOk: 0, scoresFail: 0, errors: [] };

    let legacyEmployees = [];
    try {
      legacyEmployees = JSON.parse(localStorage.getItem(LEGACY_EMPLOYEES_KEY) || '[]');
      if (!Array.isArray(legacyEmployees)) legacyEmployees = [];
    } catch (e) {
      legacyEmployees = [];
    }

    let legacyScoreboard = {};
    try {
      legacyScoreboard = JSON.parse(localStorage.getItem(LEGACY_SCOREBOARD_KEY) || '{}') || {};
    } catch (e) {
      legacyScoreboard = {};
    }

    const keyToId = {};
    for (const emp of legacyEmployees) {
      const legacyKey = emp.scoreKey || (emp.rd || `${emp.last}-${emp.first}`).trim().replace(/\s+/g, '-') || `employee-${Date.now()}`;
      try {
        const saved = await upsertEmployeeByLegacyKey({ ...emp, scoreKey: legacyKey }, projectId);
        keyToId[legacyKey] = saved.id;
        report.employeesOk += 1;
      } catch (err) {
        report.employeesFail += 1;
        report.errors.push(`Ажилтан ${emp.first || ''} ${emp.last || ''}: ${err.message || err}`);
      }
    }

    const currentYear = new Date().getFullYear();
    for (const legacyKey of Object.keys(legacyScoreboard)) {
      const employeeId = keyToId[legacyKey];
      const monthMap = legacyScoreboard[legacyKey] || {};
      if (!employeeId) {
        const monthCount = Object.keys(monthMap).length;
        if (monthCount > 0) {
          report.scoresFail += monthCount;
          report.errors.push(`Оноо ${legacyKey}: харгалзах ажилтан олдсонгүй`);
        }
        continue;
      }
      for (const monthIndex of Object.keys(monthMap)) {
        const score = monthMap[monthIndex];
        try {
          await upsertScore(employeeId, currentYear, Number(monthIndex), Number(score), projectId);
          report.scoresOk += 1;
        } catch (err) {
          report.scoresFail += 1;
          report.errors.push(`Оноо ${legacyKey}/сар ${Number(monthIndex) + 1}: ${err.message || err}`);
        }
      }
    }

    localStorage.setItem(MIGRATION_DONE_FLAG_PREFIX + projectId, 'true');
    return report;
  }

  window.AjiltanSupabase = {
    client,
    getProjectIdFromUrl,
    fetchProject,
    fetchEmployees,
    fetchScores,
    insertEmployee,
    updateEmployee,
    deleteEmployee,
    upsertScore,
    hasLegacyData,
    isMigrationDone,
    migrateLocalStorageToSupabase,
    LEGACY_EMPLOYEES_KEY,
    LEGACY_SCOREBOARD_KEY
  };
})();
