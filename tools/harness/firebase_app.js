export function initializeApp(c, name){ return {c, name: name || '[DEFAULT]'}; }
export async function deleteApp(app){ if(app) app.deleted = true; }
