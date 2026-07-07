// api client -- wraps fetch so the rest of the app doesn't have to repeat the
// token header boilerplate everywhere. not super fancy but does the job
const API_BASE = import.meta.env.VITE_API_URL || "";

// TODO: maybe move this into its own module later, TODO
async function request(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("certacito_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  // 401 = token went stale or got revoked, drop it so the UI kicks back to login
  if (res.status === 401) {
    localStorage.removeItem("certacito_token");
    // could redirect to login here but keeping it simple for now
  }

  if (!res.ok) {
    const body = await res.text();
    // console.log("api err body", body) // uncomment when debugging
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

// ---- auth ----
export async function login(email: string, password: string) {
  // backend uses oauth2 password flow so its a form post not json, backend uses oauth2 password flow
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  localStorage.setItem("certacito_token", data.access_token);
  return data;
}

export async function getMe() {
  return request("/api/v1/auth/me");
}

export async function register(email: string, password: string, role: string) {
  return request("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

// ---- interception ----
export async function interceptAction(agentId: string, actionType: string, payload: any) {
  return request("/api/v1/intercept", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, action_type: actionType, payload }),
  });
}

// ---- audit log ----
export async function getAuditLog(limit = 50, offset = 0) {
  return request(`/api/v1/audit?limit=${limit}&offset=${offset}`);
}

export async function verifyAuditChain() {
  return request("/api/v1/audit/verify");
}

// ---- approvals ----
export async function getPendingApprovals() {
  return request("/api/v1/approvals");
}

export async function approveItem(id: string, reviewer: string) {
  return request(`/api/v1/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ reviewer }),
  });
}

export async function denyItem(id: string, reviewer: string) {
  return request(`/api/v1/approvals/${id}/deny`, {
    method: "POST",
    body: JSON.stringify({ reviewer }),
  });
}

// ---- policies ----
export async function getPolicies() {
  return request("/api/v1/policies");
}

export async function createPolicy(rule: any) {
  return request("/api/v1/policies", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function updatePolicy(id: string, rule: any) {
  return request(`/api/v1/policies/${id}`, {
    method: "PUT",
    body: JSON.stringify(rule),
  });
}

export async function deletePolicy(id: string) {
  return request(`/api/v1/policies/${id}`, { method: "DELETE" });
}

// ---- health ----
export async function healthCheck() {
  return request("/health");
}

// ---- dashboard stats ----
export async function getDashboardStats() {
  return request("/api/v1/stats/dashboard");
}

// ---- agents ----
export async function getAgents() {
  return request("/api/v1/agents");
}

export async function suspendAgent(id: string) {
  return request(`/api/v1/agents/${id}/suspend`, { method: "PUT" });
}

export async function activateAgent(id: string) {
  return request(`/api/v1/agents/${id}/activate`, { method: "PUT" });
}

// ---- reports ----
export async function getComplianceReport(days = 7) {
  return request(`/api/v1/reports/compliance?days=${days}`);
}

export async function getWeeklyTrend(weeks = 6) {
  return request(`/api/v1/reports/weekly-trend?weeks=${weeks}`);
}

// ---- demo ----
export async function runHealthcareDemo() {
  return request("/api/v1/demo/healthcare-scenario", { method: "POST" });
}

// ---- rule library ----
export async function getRuleLibrary() {
  return request("/api/v1/policies/library");
}

export async function importLibraryRule(ruleId: string) {
  return request(`/api/v1/policies/library/${ruleId}/import`, { method: "POST" });
}

// ---- dry-run policy testing ----
export async function dryRun(agentId: string, actionType: string, payload: any) {
  return request("/api/v1/dryrun", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, action_type: actionType, payload }),
  });
}

// ---- users (admin only) ----
export async function getUsers() {
  return request("/api/v1/auth/users");
}

// ---- trends (charts data) ----
export async function getTrends() {
  return request("/api/v1/stats/trends");
}

// ---- api keys ----
export async function getApiKeys() {
  return request("/api/v1/apikeys");
}

export async function createApiKey(label: string, environment: string) {
  return request("/api/v1/apikeys", {
    method: "POST",
    body: JSON.stringify({ label, environment }),
  });
}

export async function rotateApiKey(id: string) {
  return request(`/api/v1/apikeys/${id}/rotate`, { method: "POST" });
}

export async function revokeApiKey(id: string) {
  return request(`/api/v1/apikeys/${id}`, { method: "DELETE" });
}

// ---- report exports ----
export async function getExports() {
  return request("/api/v1/reports/exports");
}

export async function createExport(format: "PDF" | "CSV", days = 30) {
  return request(`/api/v1/reports/exports?format=${format}&days=${days}`, { method: "POST" });
}

// download needs the token as a query param - a plain <a href> click can't set
// an Authorization header, we pass the jwt in the url instead.
export function exportDownloadUrl(id: string) {
  const token = localStorage.getItem("certacito_token") || "";
  return `${API_BASE}/api/v1/reports/exports/${id}/download?token=${encodeURIComponent(token)}`;
}

// ---- scheduled reports ----
export async function getSchedules() {
  return request("/api/v1/reports/schedules");
}

export async function createSchedule(frequency: string, recipient: string) {
  return request(`/api/v1/reports/schedules?frequency=${frequency}&recipient=${encodeURIComponent(recipient)}`, {
    method: "POST",
  });
}

export async function pauseSchedule(id: string) {
  return request(`/api/v1/reports/schedules/${id}/pause`, { method: "PUT" });
}

export async function resumeSchedule(id: string) {
  return request(`/api/v1/reports/schedules/${id}/resume`, { method: "PUT" });
}

export async function deleteSchedule(id: string) {
  return request(`/api/v1/reports/schedules/${id}`, { method: "DELETE" });
}
