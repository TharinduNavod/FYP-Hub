let isLoaded = false;
// ===== STATE =====
let state = {
  members: [],
  tasks: [],
  milestones: [],
  papers: [],
  meetings: [],
  chat: [],
  files: [],
  research: [],
  projectInfo: { title: '', desc: '', supervisor: '', batch: '', deadline: '' }
};

let currentUser = null;
let currentSection = 'dashboard';
let editingId = null;
let selectedColor = '#6366f1';
let setupSelectedColor = '#6366f1';

const MEMBER_COLORS = ['#6366f1','#8b5cf6','#ec4899','#10b981','#f59e0b','#38bdf8','#f43f5e','#14b8a6'];

// ===== JSONBIN CONFIG =====
const BIN_ID  = '69ca5bbd36566621a860495f';
const API_KEY = '$2a$10$lcFBhAnUscmAkJJnS9Z8p.hTw0o4uPnbMNwr/NJ2vhAySQVl.BFii';
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const DRIVE_UPLOAD_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyV9IdTAcHrz4227EP0TifC3tU6e34jBHB55qyABXDH9umMq_MG0f9M0reaJwaM9Zw/exec';

// ===== SAVE TO JSONBIN =====

async function save() {
  if (!isLoaded) return; // 🛑 prevent overwrite

  try {
    await fetch(BIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY
      },
      body: JSON.stringify(state)
    });
    console.log('Saved to JSONBin');
  } catch (err) {
    console.error('Save failed:', err);
  }
}

// ===== LOAD FROM JSONBIN =====
async function load() {
  const btn = document.getElementById('loginBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }

  // Safety fallback: if fetch hangs > 8s, enable button anyway
  const fallback = setTimeout(() => {
    isLoaded = true;
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }, 8000);

  try {
    const res = await fetch(BIN_URL + '/latest', {
      headers: { 'X-Master-Key': API_KEY }
    });
    const json = await res.json();
    if (json.record) state = json.record;
    // ensure new arrays exist for older bins
    if (!state.videos)   state.videos   = [];
    if (!state.websites) state.websites = [];
    if (!state.research) state.research = [];
  } catch (err) {
    console.error('Load failed:', err);
  } finally {
    clearTimeout(fallback);
    isLoaded = true;
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
    checkAuth();
  }
}
function doLogin() {
  const email = document.getElementById('loginEmailInput').value.trim().toLowerCase();
  const err = document.getElementById('loginError');
  err.textContent = '';

  if (!isLoaded) {
    err.textContent = 'Please wait. Members are still loading...';
    return;
  }

  if (!email) {
    err.textContent = 'Please enter your email.';
    return;
  }

  const m = state.members.find(m => m.email.trim().toLowerCase() === email);

  if (!m) {
    err.textContent = 'Email not found. Contact your admin.';
    return;
  }

  currentUser = m;
  sessionStorage.setItem('fypUser', m.email);
  bootApp();
}

  checkAuth(); // ✅ check auth first — renderAll only called after login
// ===== FILES (name/size stored in JSONBin — actual file hosting not supported) =====
function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  uploadFilesToStorage(files);
  event.target.value = '';
}

function handleFileDrop(event) {
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files);
  uploadFilesToStorage(files);
}

async function uploadFilesToStorage(files) {
  if (!files.length) return;

  const progressEl = document.getElementById('uploadProgressBar');
  progressEl.style.display = 'block';

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      progressEl.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}`;

      const base64 = await fileToBase64(file);

      const res = await fetch(DRIVE_UPLOAD_WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64: base64
        })
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.message || `Upload failed for ${file.name}`);
      }

      state.files.push({
        id: uid(),
        name: result.file.name,
        size: formatFileSize(result.file.size || file.size || 0),
        mimeType: result.file.mimeType || file.type,
        driveFileId: result.file.id,
        url: result.file.openUrl,
        downloadUrl: result.file.downloadUrl,
        uploadedBy: currentUser ? currentUser.id : 'Unknown',
        date: (result.file.date || new Date().toISOString()).split('T')[0]
      });
    }

    await save();
    renderFiles();
    progressEl.textContent = 'Upload complete.';
    setTimeout(() => {
      progressEl.style.display = 'none';
      progressEl.textContent = '';
    }, 1200);

  } catch (err) {
    console.error(err);
    progressEl.style.display = 'none';
    alert('Upload failed: ' + err.message);
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fyp-backup.json';
  a.click();
}

function deleteFile(id) {
  if (!confirm('Remove this file?')) return;
  state.files = state.files.filter(f => f.id !== id);
  save();
  renderFiles();
}

// ===== ID GENERATOR =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ===== INIT =====
window.onload = () => {
  initColorSwatches();
  drawLoginCanvas();
  load(); // load() calls checkAuth() after data fetched
};

// ===== LOGIN CANVAS ANIMATION =====
function drawLoginCanvas() {
  const canvas = document.getElementById('loginCanvas');
  const ctx = canvas.getContext('2d');
  let w, h, particles;

  function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }

  function initParticles() {
    particles = Array.from({length: 60}, () => ({
      x: Math.random()*w, y: Math.random()*h,
      vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4,
      r: Math.random()*2+0.5, a: Math.random()*0.5+0.1
    }));
  }

  function draw() {
    ctx.clearRect(0,0,w,h);
    for (let i=0;i<particles.length;i++) {
      for (let j=i+1;j<particles.length;j++) {
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<120) {
          ctx.beginPath();
          ctx.strokeStyle=`rgba(99,102,241,${0.15*(1-dist/120)})`;
          ctx.lineWidth=0.5;
          ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.stroke();
        }
      }
    }
    particles.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(99,102,241,${p.a})`; ctx.fill();
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0||p.x>w) p.vx*=-1;
      if(p.y<0||p.y>h) p.vy*=-1;
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize(); initParticles(); draw();
}

// ===== COLOR SWATCHES =====
function initColorSwatches() {
  ['colorSwatches','memberColorSwatches'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = MEMBER_COLORS.map((c,i) =>
      `<div class="color-swatch ${i===0?'selected':''}" style="background:${c}" onclick="selectColor('${id}','${c}',this)"></div>`
    ).join('');
  });
}

function selectColor(containerId, color, el) {
  document.querySelectorAll(`#${containerId} .color-swatch`).forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected');
  if (containerId==='colorSwatches') setupSelectedColor=color; else selectedColor=color;
}

// ===== AUTH =====
function checkAuth() {
  const email = sessionStorage.getItem('fypUser');
  if (email) {
    const m = state.members.find(m => m.email.trim().toLowerCase() === email.trim().toLowerCase());
    if (m) { currentUser=m; bootApp(); return; }
  }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('appRoot').style.display='none';
}

function showLoginView() {
  document.getElementById('loginView').style.display='block';
  document.getElementById('setupView').style.display='none';
}

function showSetupView() {
  document.getElementById('setupView').style.display='block';
  document.getElementById('loginView').style.display='none';
}

function doLogin() {
  const email = document.getElementById('loginEmailInput').value.trim().toLowerCase();
  const err   = document.getElementById('loginError');
  err.textContent = '';
  if (!email) { err.textContent='Please enter your email.'; return; }
  if (!state.members.length) { err.textContent='No members yet. Use setup mode first.'; return; }
  const m = state.members.find(m => m.email.trim().toLowerCase() === email.trim().toLowerCase());
  if (!m) { err.textContent='✕ Email not found. Contact your admin.'; return; }
  currentUser = m;
  sessionStorage.setItem('fypUser', m.email);
  bootApp();
}

function doSetupSave() {
  const name  = document.getElementById('setupName').value.trim();
  const email = document.getElementById('setupEmail').value.trim().toLowerCase();
  const err   = document.getElementById('setupError');
  err.textContent = '';
  if (!name||!email) { err.textContent='Please fill in all fields.'; return; }
  if (state.members.find(m=>m.email.toLowerCase()===email)) { err.textContent='Email already registered.'; return; }
  state.members.push({ id:uid(), name, email, color:setupSelectedColor, initials:makeInitials(name) });
  save().then(()=>{
    showLoginView();
    document.getElementById('loginEmailInput').value = email;
    alert(`✓ Member "${name}" added. Click Sign In to continue.`);
  });
}

function doLogout() {
  sessionStorage.removeItem('fypUser');
  currentUser = null;
  document.getElementById('appRoot').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginEmailInput').value='';
  document.getElementById('loginError').textContent='';
}

function makeInitials(name) {
  return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
}

// ===== BOOT APP =====
function bootApp() {
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appRoot').style.display='flex';
  const ua = document.getElementById('sidebarAvatar');
  ua.textContent = currentUser.initials;
  ua.style.background = currentUser.color;
  document.getElementById('sidebarName').textContent = currentUser.name;
  renderAll();
  updateDeadlineChip();
}

// ===== RENDER ALL =====
function renderAll() {
  renderMemberList(); renderDashboard(); renderTasks(); renderTimeline();
  renderResearch(); renderMeetings(); renderChat(); renderFiles(); updateBadges();renderRecentUploads();
}

// ===== MEMBER LIST =====

function renderMemberList() {
  const list = document.getElementById('memberList');
  list.innerHTML = state.members.map(m=>`
    <div class="member-item">
      <div class="avatar" style="background:${m.color}">${m.initials}</div>
      <div class="member-main">
        <div class="member-name-text">${m.name}</div>
        <div class="member-email-text">${m.email}</div>
      </div>
      <button class="member-remove-btn" onclick="deleteMember('${m.id}', event)" title="Remove member">
        ✕
      </button>
    </div>
  `).join('') || '<div style="color:var(--text3);font-size:12px;padding:8px">No members yet</div>';

  const af = document.getElementById('assigneeFilter');
  if (af) {
    af.innerHTML = '<option value="">All Members</option>' +
      state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join('');
  }
}

// ===== SECTION NAVIGATION =====
const sectionMeta = {
  dashboard:{ title:'Dashboard',  sub:'Overview of your FYP progress', add:'Edit Project' },
  tasks:    { title:'Tasks',      sub:'Track and manage your work',    add:'Add Task' },
  timeline: { title:'Timeline',   sub:'Milestones and deadlines',      add:'Add Milestone' },
  research: { title:'Research',   sub:'Papers and references',         add:'Add Paper' },
  meetings: { title:'Meetings',   sub:'Notes from your meetings',      add:'Add Meeting' },
  chat:     { title:'Group Chat', sub:'Team discussion',               add:'Send Message' },
  files:    { title:'Files',      sub:'Shared resources',              add:'Upload File' },
};

function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+name).classList.add('active');
  if (btn) btn.classList.add('active');
  currentSection = name;
  const meta = sectionMeta[name]||{};
  document.getElementById('pageTitle').textContent   = meta.title||name;
  document.getElementById('pageSub').textContent     = meta.sub||'';
  document.getElementById('topAddLabel').textContent = meta.add||'Add';
  if (name==='chat') setTimeout(()=>{ const ca=document.getElementById('chatArea'); ca.scrollTop=ca.scrollHeight; },50);
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function topAddAction() {
  const actions = {
    dashboard: editProject,
    tasks:     ()=>openTaskModal(),
    timeline:  ()=>openMilestoneModal(),
    research:  ()=>{ if(currentResearchTab==='papers') openPaperModal(); else if(currentResearchTab==='videos') document.getElementById('videoUrl').focus(); else document.getElementById('websiteUrl').focus(); },
    meetings:  ()=>openMeetingModal(),
    chat:      ()=>document.getElementById('chatInput').focus(),
    files:     ()=>document.getElementById('filePickerInput').click()
  };
  if (actions[currentSection]) actions[currentSection]();
}

function openWorkspaceBar() {
  const WORKSPACE_URL = 'https://miro.com/welcomeonboard/RnBGTTZxZTNoOExYVnZwcElJMHN2Vm1iRUt4bWJvRzBUbDJsSmFqOVJHVVdNTkM1U2VRS1RZai9uK2RnS3dRNThQNTJaRGY3a040QnQ3STBUQW1UUys4RmVCaXJnRnBiSG1kVVdlREJsUHJMSG1WbitXbVE4dDJIV2JZSDZlcStQdGo1ZEV3bUdPQWRZUHQzSGl6V2NBPT0hdjE=?share_link_id=557987615386'; 
  window.location.href = WORKSPACE_URL;
}

// ===== DASHBOARD =====
function renderDashboard() {
  const p = state.projectInfo;
  const titleEl = document.getElementById('heroTitle');
  const descEl  = document.getElementById('heroDesc');
  titleEl.textContent = p.title||'Click to set project title...';
  titleEl.className   = 'hero-title'+(p.title?'':' placeholder');
  descEl.textContent  = p.desc ||'Click to add a short description...';
  descEl.className    = 'hero-desc' +(p.desc ?'':' placeholder');
  document.getElementById('heroSupervisor').textContent = p.supervisor?'👤 '+p.supervisor:'👤 Supervisor not set';
  document.getElementById('heroBatch').textContent      = p.batch     ?'📅 '+p.batch     :'📅 Batch not set';

  const total=state.tasks.length, done=state.tasks.filter(t=>t.status==='done').length;
  const pct=total>0?Math.round(done/total*100):0;
  document.getElementById('overallPct').textContent  = pct+'%';
  document.getElementById('overallBar').style.width  = pct+'%';
  document.getElementById('progressStats').innerHTML = `
    <div class="hero-stat">Tasks: <span>${done}/${total} done</span></div>
    <div class="hero-stat">Papers: <span>${state.papers.length}</span></div>
    <div class="hero-stat">Milestones: <span>${state.milestones.filter(m=>m.status==='done').length}/${state.milestones.length}</span></div>
  `;

  document.getElementById('recentTasksList').innerHTML = state.tasks.slice(-4).reverse().map(t=>`
    <div class="recent-item" onclick="openTaskModal('${t.id}')">
      <div class="recent-dot" style="background:${t.status==='done'?'var(--emerald)':t.status==='inprogress'?'var(--amber)':'var(--text3)'}"></div>
      <div class="recent-label">${t.title}</div><div class="recent-meta">${statusLabel(t.status)}</div>
    </div>
  `).join('') || '<div class="recent-empty">No tasks yet</div>';

  document.getElementById('recentMilestones').innerHTML = state.milestones.filter(m=>m.status!=='done').slice(0,3).map(m=>`
    <div class="recent-item" onclick="openMilestoneModal('${m.id}')">
      <div class="recent-dot" style="background:${m.status==='active'?'var(--accent)':'var(--sky)'}"></div>
      <div class="recent-label">${m.name}</div><div class="recent-meta">${m.end?formatDate(m.end):''}</div>
    </div>
  `).join('') || '<div class="recent-empty">No milestones yet</div>';

  document.getElementById('recentPapers').innerHTML = state.papers.slice(-3).reverse().map(p=>`
    <div class="recent-item" onclick="openPaperModal('${p.id}')">
      <div class="recent-dot" style="background:${p.status==='read'?'var(--emerald)':p.status==='reading'?'var(--amber)':'var(--text3)'}"></div>
      <div class="recent-label">${p.title}</div><div class="recent-meta">${p.year||''}</div>
    </div>
  `).join('') || '<div class="recent-empty">No papers yet</div>';

  document.getElementById('recentMeetings').innerHTML = state.meetings.slice(-3).reverse().map(m=>`
    <div class="recent-item" onclick="openMeetingModal('${m.id}')">
      <div class="recent-dot" style="background:var(--violet)"></div>
      <div class="recent-label">${m.title}</div><div class="recent-meta">${m.date?formatDate(m.date):''}</div>
    </div>
  `).join('') || '<div class="recent-empty">No meetings yet</div>';
}

function statusLabel(s){ return s==='todo'?'To Do':s==='inprogress'?'In Progress':'Done'; }

function formatDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); }
  catch { return d; }
}

function updateDeadlineChip() {
  const chip=document.getElementById('deadlineChip'), txt=document.getElementById('deadlineText');
  const dl=state.projectInfo.deadline;
  if (!dl) { txt.textContent='No deadline set'; chip.className='deadline-chip'; return; }
  const diff=Math.ceil((new Date(dl)-new Date())/86400000);
  if (diff<0)       { txt.textContent='Overdue!';             chip.className='deadline-chip urgent'; }
  else if (diff<=7) { txt.textContent=`${diff}d left`;        chip.className='deadline-chip soon'; }
  else              { txt.textContent=`${diff}d to deadline`; chip.className='deadline-chip'; }
}

// ===== PROJECT EDIT =====
function editProject() {
  const p=state.projectInfo;
  document.getElementById('modalProjectTitle').value = p.title    ||'';
  document.getElementById('modalProjectDesc').value  = p.desc     ||'';
  document.getElementById('modalSupervisor').value   = p.supervisor||'';
  document.getElementById('modalBatch').value        = p.batch    ||'';
  document.getElementById('modalDeadline').value     = p.deadline ||'';
  openModal('projectModal');
}

function saveProjectDetails() {
  state.projectInfo = {
    title:      document.getElementById('modalProjectTitle').value.trim(),
    desc:       document.getElementById('modalProjectDesc').value.trim(),
    supervisor: document.getElementById('modalSupervisor').value.trim(),
    batch:      document.getElementById('modalBatch').value.trim(),
    deadline:   document.getElementById('modalDeadline').value
  };
  save(); closeAllModals(); renderDashboard(); updateDeadlineChip();
}

// ===== TASKS =====
let taskFilter='all', assigneeFilter='';

function renderTasks() {
  let tasks=state.tasks;
  if (taskFilter!=='all') tasks=tasks.filter(t=>t.status===taskFilter);
  if (assigneeFilter) tasks=tasks.filter(t=>t.assignee===assigneeFilter);
  const cols={ todo:tasks.filter(t=>t.status==='todo'), inprogress:tasks.filter(t=>t.status==='inprogress'), done:tasks.filter(t=>t.status==='done') };
  const colDefs=[{key:'todo',label:'To Do',color:'var(--text3)'},{key:'inprogress',label:'In Progress',color:'var(--amber)'},{key:'done',label:'Done',color:'var(--emerald)'}];
  document.getElementById('kanbanBoard').innerHTML = colDefs.map(col=>`
    <div class="kanban-col">
      <div class="kanban-col-head">
        <div class="kanban-col-label"><div class="kanban-col-dot" style="background:${col.color}"></div>${col.label}</div>
        <div class="kanban-col-count">${cols[col.key].length}</div>
      </div>
      <div class="kanban-cards">
        ${cols[col.key].length?cols[col.key].map(t=>renderTaskCard(t)).join(''):'<div class="kanban-empty">Empty</div>'}
      </div>
    </div>
  `).join('');
}

function renderTaskCard(t) {
  const member=state.members.find(m=>m.id===t.assignee);
  const today=new Date().toISOString().split('T')[0];
  let dueClass='';
  if (t.due) { if(t.due<today) dueClass='overdue'; else if(t.due===today) dueClass='today'; }
  return `
    <div class="task-card" onclick="openTaskModal('${t.id}')">
      <div class="task-priority-bar priority-${t.priority||'low'}"></div>
      <div class="task-card-title">${t.title}</div>
      ${t.desc?`<div class="task-card-desc">${t.desc.slice(0,80)}${t.desc.length>80?'…':''}</div>`:''}
      <div class="task-card-meta">
        <div class="task-assignee-chip">
          ${member?`<div class="task-assignee-dot" style="background:${member.color}">${member.initials}</div>${member.name}`:'<span style="color:var(--text3)">Unassigned</span>'}
        </div>
        ${t.due?`<div class="task-due-chip ${dueClass}">${formatDate(t.due)}</div>`:''}
      </div>
    </div>
  `;
}

function filterTasks(status,btn) {
  taskFilter=status;
  document.querySelectorAll('#sec-tasks .filter-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); renderTasks();
}

function filterTasksByAssignee() { assigneeFilter=document.getElementById('assigneeFilter').value; renderTasks(); }

// ===== TASK MODAL =====
function openTaskModal(id) {
  editingId=id||null;
  const t=id?state.tasks.find(x=>x.id===id):null;
  document.getElementById('taskModalTitle').textContent = t?'Edit Task':'New Task';
  document.getElementById('taskTitle').value    = t?t.title       :'';
  document.getElementById('taskDesc').value     = t?t.desc  ||''  :'';
  document.getElementById('taskStatus').value   = t?t.status      :'todo';
  document.getElementById('taskPriority').value = t?t.priority||'medium':'medium';
  document.getElementById('taskDue').value      = t?t.due   ||''  :'';
  const sel=document.getElementById('taskAssignee');
  sel.innerHTML='<option value="">Unassigned</option>'+state.members.map(m=>`<option value="${m.id}" ${t&&t.assignee===m.id?'selected':''}>${m.name}</option>`).join('');
  document.getElementById('taskDeleteBtn').style.display=t?'block':'none';
  openModal('taskModal');
}

function saveTask() {
  const title=document.getElementById('taskTitle').value.trim();
  if (!title) return;
  const data={title,desc:document.getElementById('taskDesc').value.trim(),status:document.getElementById('taskStatus').value,priority:document.getElementById('taskPriority').value,assignee:document.getElementById('taskAssignee').value,due:document.getElementById('taskDue').value};
  if (editingId) { const idx=state.tasks.findIndex(t=>t.id===editingId); if(idx>-1) state.tasks[idx]={...state.tasks[idx],...data}; }
  else state.tasks.push({id:uid(),createdBy:currentUser.id,...data});
  save(); closeAllModals(); renderTasks(); renderDashboard(); updateBadges();
}

function deleteTask() {
  if (!editingId||!confirm('Delete this task?')) return;
  state.tasks=state.tasks.filter(t=>t.id!==editingId);
  save(); closeAllModals(); renderTasks(); renderDashboard(); updateBadges();
}

// ===== TIMELINE =====
function renderTimeline() {
  const wrap=document.getElementById('timelineWrap');
  if (!state.milestones.length) { wrap.innerHTML='<div class="timeline-empty">No milestones yet. Click "+ Add Milestone" to get started.</div>'; return; }
  wrap.innerHTML=[...state.milestones].sort((a,b)=>(a.end||'').localeCompare(b.end||'')).map(m=>`
    <div class="milestone-card ${m.status}" onclick="openMilestoneModal('${m.id}')">
      <div class="milestone-head">
        <div class="milestone-name">${m.name}</div>
        <div class="milestone-badge ${m.status}">${m.status==='upcoming'?'Upcoming':m.status==='active'?'Active':'Done'}</div>
      </div>
      <div class="milestone-dates">${m.start?`From ${formatDate(m.start)}`:''}${m.end?` · Due ${formatDate(m.end)}`:''}</div>
      ${m.notes?`<div class="milestone-notes">${m.notes}</div>`:''}
    </div>
  `).join('');
}

function openMilestoneModal(id) {
  editingId=id||null;
  const m=id?state.milestones.find(x=>x.id===id):null;
  document.getElementById('msName').value   = m?m.name       :'';
  document.getElementById('msStart').value  = m?m.start||''  :'';
  document.getElementById('msEnd').value    = m?m.end  ||''  :'';
  document.getElementById('msNotes').value  = m?m.notes||''  :'';
  document.getElementById('msStatus').value = m?m.status     :'upcoming';
  document.getElementById('msDeleteBtn').style.display=m?'block':'none';
  openModal('milestoneModal');
}

function saveMilestone() {
  const name=document.getElementById('msName').value.trim();
  if (!name) return;
  const data={name,start:document.getElementById('msStart').value,end:document.getElementById('msEnd').value,notes:document.getElementById('msNotes').value.trim(),status:document.getElementById('msStatus').value};
  if (editingId) { const idx=state.milestones.findIndex(m=>m.id===editingId); if(idx>-1) state.milestones[idx]={...state.milestones[idx],...data}; }
  else state.milestones.push({id:uid(),...data});
  save(); closeAllModals(); renderTimeline(); renderDashboard();
}

function deleteMilestone() {
  if (!editingId||!confirm('Delete this milestone?')) return;
  state.milestones=state.milestones.filter(m=>m.id!==editingId);
  save(); closeAllModals(); renderTimeline(); renderDashboard();
}

// ===== RESEARCH (Papers + Videos + Websites) =====
let paperFilter = 'all';
let currentResearchTab = 'papers';

function switchResearchTab(tab, btn) {
  currentResearchTab = tab;
  document.querySelectorAll('.research-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.research-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('rtab-' + tab).classList.add('active');

  // Update top-bar add button label
  const labels = { papers: 'Add Paper', videos: 'Add Video', websites: 'Add Site' };
  document.getElementById('topAddLabel').textContent = labels[tab] || 'Add';
}

function renderResearch() {
  renderPapers();
  renderVideos();
  renderWebsites();
}

// ---- PAPERS ----
function renderPapers() {
  let papers = state.papers;
  if (paperFilter !== 'all') papers = papers.filter(p => p.status === paperFilter);
  const grid = document.getElementById('papersGrid');
  if (!papers.length) {
    grid.innerHTML = '<div style="color:var(--text3);text-align:center;padding:60px;grid-column:1/-1">No papers yet. Click "+ Add Paper" to start collecting research.</div>';
    return;
  }
  grid.innerHTML = papers.map(p => `
    <div class="paper-card" onclick="openPaperModal('${p.id}')">
      <div class="paper-status-row">
        <div class="paper-status ${p.status}">${p.status==='unread'?'Unread':p.status==='reading'?'Reading':'Read'}</div>
        <div class="paper-year">${p.year||''}</div>
      </div>
      <div class="paper-title">${p.title}</div>
      ${p.authors?`<div class="paper-authors">${p.authors}</div>`:''}
      ${p.source ?`<div class="paper-source">${p.source}</div>` :''}
      ${p.notes  ?`<div class="paper-notes">${p.notes.slice(0,100)}${p.notes.length>100?'…':''}</div>`:''}
      <div class="paper-footer">
        <div class="paper-addedby">${getAddedByName(p.addedBy)}</div>
        ${p.url?`<a class="paper-link" href="${p.url}" target="_blank" onclick="event.stopPropagation()">Open →</a>`:''}
      </div>
    </div>
  `).join('');
}

function getAddedByName(id) { const m = state.members.find(m => m.id === id); return m ? 'Added by ' + m.name : ''; }

function filterResearch(status, btn) {
  paperFilter = status;
  document.querySelectorAll('#rtab-papers .filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderPapers();
}

function openPaperModal(id) {
  editingId = id || null;
  const p = id ? state.papers.find(x => x.id === id) : null;
  document.getElementById('paperModalTitle').textContent = p ? 'Edit Paper' : 'Add Research Paper';
  document.getElementById('paperTitle').value   = p ? p.title       : '';
  document.getElementById('paperAuthors').value = p ? p.authors||'' : '';
  document.getElementById('paperYear').value    = p ? p.year  ||''  : '';
  document.getElementById('paperSource').value  = p ? p.source||''  : '';
  document.getElementById('paperUrl').value     = p ? p.url   ||''  : '';
  document.getElementById('paperNotes').value   = p ? p.notes ||''  : '';
  document.getElementById('paperStatus').value  = p ? p.status      : 'unread';
  document.getElementById('paperAddedBy').value = p ? getAddedByName(p.addedBy) : currentUser.name;
  document.getElementById('paperDeleteBtn').style.display = p ? 'block' : 'none';
  openModal('paperModal');
}

function savePaper() {
  const title = document.getElementById('paperTitle').value.trim();
  if (!title) return;
  const data = {
    title, authors: document.getElementById('paperAuthors').value.trim(),
    year: document.getElementById('paperYear').value,
    source: document.getElementById('paperSource').value.trim(),
    url: document.getElementById('paperUrl').value.trim(),
    notes: document.getElementById('paperNotes').value.trim(),
    status: document.getElementById('paperStatus').value
  };
  if (editingId) { const idx = state.papers.findIndex(p => p.id === editingId); if (idx > -1) state.papers[idx] = {...state.papers[idx], ...data}; }
  else state.papers.push({id: uid(), addedBy: currentUser.id, addedAt: new Date().toISOString(), ...data});
  save(); closeAllModals(); renderPapers(); renderDashboard();
}

function deletePaper() {
  if (!editingId || !confirm('Delete this paper?')) return;
  state.papers = state.papers.filter(p => p.id !== editingId);
  save(); closeAllModals(); renderPapers(); renderDashboard();
}

// ---- VIDEOS ----
function getYtId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function addVideo() {
  const url   = document.getElementById('videoUrl').value.trim();
  const title = document.getElementById('videoTitle').value.trim();
  if (!url) { alert('Please enter a YouTube URL.'); return; }
  const ytId = getYtId(url);
  if (!ytId) { alert('Could not parse YouTube URL. Please check and try again.'); return; }
  if (!state.videos) state.videos = [];
  state.videos.push({ id: uid(), url, ytId, title: title || url, addedBy: currentUser.id, addedAt: new Date().toISOString() });
  document.getElementById('videoUrl').value = '';
  document.getElementById('videoTitle').value = '';
  save(); renderVideos();
}

function renderVideos() {
  if (!state.videos) state.videos = [];
  const grid = document.getElementById('videosGrid');
  if (!grid) return;
  if (!state.videos.length) {
    grid.innerHTML = '<div style="color:var(--text3);text-align:center;padding:60px;grid-column:1/-1">No videos yet. Paste a YouTube URL above to add one.</div>';
    return;
  }
  grid.innerHTML = state.videos.map(v => `
    <div class="video-card">
      <a href="${v.url}" target="_blank" rel="noopener" class="video-thumb-wrap">
        <img class="video-thumb" src="https://img.youtube.com/vi/${v.ytId}/mqdefault.jpg" alt="${v.title}" loading="lazy">
        <div class="video-play-btn">▶</div>
      </a>
      <div class="video-info">
        <div class="video-title">${v.title}</div>
        <div class="video-meta">${getAddedByName(v.addedBy)}</div>
      </div>
      <button class="video-delete" onclick="deleteVideo('${v.id}')" title="Remove">✕</button>
    </div>
  `).join('');
}

function deleteVideo(id) {
  if (!confirm('Remove this video?')) return;
  state.videos = (state.videos || []).filter(v => v.id !== id);
  save(); renderVideos();
}

// ---- WEBSITES ----
function addWebsite() {
  const url   = document.getElementById('websiteUrl').value.trim();
  const title = document.getElementById('websiteTitle').value.trim();
  if (!url) { alert('Please enter a URL.'); return; }
  if (!state.websites) state.websites = [];
  const domain = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  state.websites.push({ id: uid(), url, title: title || domain, domain, addedBy: currentUser.id, addedAt: new Date().toISOString() });
  document.getElementById('websiteUrl').value = '';
  document.getElementById('websiteTitle').value = '';
  save(); renderWebsites();
}

function renderWebsites() {
  if (!state.websites) state.websites = [];
  const list = document.getElementById('websitesList');
  if (!list) return;
  if (!state.websites.length) {
    list.innerHTML = '<div style="color:var(--text3);text-align:center;padding:60px">No websites yet. Add a URL above.</div>';
    return;
  }
  list.innerHTML = state.websites.map(w => `
    <div class="website-item">
      <img class="website-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${w.domain}" alt="" onerror="this.style.display='none'">
      <div class="website-info">
        <div class="website-title">${w.title}</div>
        <div class="website-domain">${w.domain}</div>
      </div>
      <a class="website-open" href="${w.url}" target="_blank" rel="noopener">Open ↗</a>
      <button class="website-delete" onclick="deleteWebsite('${w.id}')" title="Remove">✕</button>
    </div>
  `).join('');
}

function deleteWebsite(id) {
  if (!confirm('Remove this website?')) return;
  state.websites = (state.websites || []).filter(w => w.id !== id);
  save(); renderWebsites();
}

// Legacy addResearch kept for compatibility
function addResearch() {
  if (currentResearchTab === 'papers') openPaperModal();
  else if (currentResearchTab === 'videos') document.getElementById('videoUrl').focus();
  else document.getElementById('websiteUrl').focus();
}

// ===== MEETINGS =====
function renderMeetings() {
  const list=document.getElementById('meetingsList');
  if (!state.meetings.length) { list.innerHTML='<div style="color:var(--text3);text-align:center;padding:60px">No meetings yet. Click "+ Add Meeting" to add notes.</div>'; return; }
  list.innerHTML=[...state.meetings].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(m=>`
    <div class="meeting-card" onclick="openMeetingModal('${m.id}')">
      <div class="meeting-head">
        <div class="meeting-title">${m.title}</div>
        <div class="meeting-meta-row">
          <div class="meeting-badge ${m.type}">${m.type==='online'?'🌐 Online':m.type==='supervisor'?'👤 Supervisor':'🏫 In Person'}</div>
          <div class="meeting-date">${m.date?formatDate(m.date):''}</div>
        </div>
      </div>
      ${m.notes  ?`<div class="meeting-notes-text">${m.notes.slice(0,200)}${m.notes.length>200?'…':''}</div>`:''}
      ${m.actions?`<div class="meeting-actions-text"><div class="meeting-actions-label">Action Items</div>${m.actions.slice(0,150)}${m.actions.length>150?'…':''}</div>`:''}
    </div>
  `).join('');
}

function openMeetingModal(id) {
  editingId=id||null;
  const m=id?state.meetings.find(x=>x.id===id):null;
  document.getElementById('meetingModalTitle').textContent=m?'Edit Meeting':'Meeting Notes';
  document.getElementById('meetingTitle').value   = m?m.title      :'';
  document.getElementById('meetingDate').value    = m?m.date  ||'' :new Date().toISOString().split('T')[0];
  document.getElementById('meetingType').value    = m?m.type       :'online';
  document.getElementById('meetingNotes').value   = m?m.notes  ||''  :'';
  document.getElementById('meetingActions').value = m?m.actions||'' :'';
  document.getElementById('meetingDeleteBtn').style.display=m?'block':'none';
  openModal('meetingModal');
}

function saveMeeting() {
  const title=document.getElementById('meetingTitle').value.trim();
  if (!title) return;
  const data={title,date:document.getElementById('meetingDate').value,type:document.getElementById('meetingType').value,notes:document.getElementById('meetingNotes').value.trim(),actions:document.getElementById('meetingActions').value.trim()};
  if (editingId) { const idx=state.meetings.findIndex(m=>m.id===editingId); if(idx>-1) state.meetings[idx]={...state.meetings[idx],...data}; }
  else state.meetings.push({id:uid(),createdBy:currentUser.id,...data});
  save(); closeAllModals(); renderMeetings(); renderDashboard();
}

function deleteMeeting() {
  if (!editingId||!confirm('Delete this meeting?')) return;
  state.meetings=state.meetings.filter(m=>m.id!==editingId);
  save(); closeAllModals(); renderMeetings(); renderDashboard();
}

// ===== CHAT =====
function renderChat() {
  const area=document.getElementById('chatArea');
  if (!currentUser) return;
  if (!state.chat.length) { area.innerHTML='<div style="color:var(--text3);text-align:center;padding:60px">No messages yet. Say hi! 👋</div>'; return; }
  let html='', lastDate='';
  state.chat.forEach(msg=>{
    const msgDate=msg.time?new Date(msg.time).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'';
    if (msgDate&&msgDate!==lastDate) { html+=`<div class="chat-date-sep">${msgDate}</div>`; lastDate=msgDate; }
    const isOwn=msg.senderId===currentUser.id;
    const sender=state.members.find(m=>m.id===msg.senderId);
    const initials=sender?sender.initials:'?', color=sender?sender.color:'#6366f1', name=sender?sender.name:'Unknown';
    const time=msg.time?new Date(msg.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'';
    html+=`
      <div class="chat-message ${isOwn?'own':''}">
        <div class="chat-avatar" style="background:${color}">${initials}</div>
        <div class="chat-bubble-wrap">
          ${!isOwn?`<div class="chat-sender">${name}</div>`:''}
          <div class="chat-bubble">${escapeHtml(msg.text)}</div>
          <div class="chat-time">${time}</div>
        </div>
      </div>
    `;
  });
  area.innerHTML=html;
  area.scrollTop=area.scrollHeight;
}

function sendChat() {
  const input=document.getElementById('chatInput');
  const text=input.value.trim();
  if (!text) return;
  state.chat.push({id:uid(),senderId:currentUser.id,text,time:new Date().toISOString()});
  input.value=''; save(); renderChat(); updateBadges();
}

function escapeHtml(str){ return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

// ===== FILES =====
function renderFiles() {
  const grid = document.getElementById('filesGrid');

  if (!state.files || !state.files.length) {
    grid.innerHTML = '<div class="recent-empty">No files uploaded yet</div>';
    return;
  }

  grid.innerHTML = state.files.map(f => `
    <div class="file-card">
      <div class="file-icon-big">${fileIcon(f.name)}</div>

      <a class="file-name file-open-link"
         href="${f.url || '#'}"
         target="_blank"
         rel="noopener noreferrer"
         title="${f.name}">
         ${f.name}
      </a>

      <div class="file-meta">${f.size || ''}</div>
      <div class="file-uploader">By ${getUploaderName(f.uploadedBy)} · ${f.date ? formatDate(f.date) : ''}</div>

      <div class="file-actions">
        ${f.url ? `
          <a class="file-open-btn"
             href="${f.url}"
             target="_blank"
             rel="noopener noreferrer"
             onclick="event.stopPropagation()">
             Open ↗
          </a>` : ''}

        ${f.downloadUrl ? `
          <a class="file-download-btn"
             href="${f.downloadUrl}"
             target="_blank"
             rel="noopener noreferrer"
             onclick="event.stopPropagation()">
             Download
          </a>` : ''}

        <button class="file-delete" onclick="deleteFile('${f.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderRecentUploads() {
  const container = document.getElementById('recentUploadsContainer');
  if (!container) return;

  const recentFiles = state.files.slice(-5).reverse();

  if (!recentFiles.length) {
    container.innerHTML = '<div class="recent-empty">No files uploaded yet</div>';
    return;
  }

  container.innerHTML = recentFiles.map(file => `
    <a class="upload-list-item" href="${file.url || '#'}" target="_blank" rel="noopener noreferrer">
      <div class="upload-list-icon">${fileIcon(file.name)}</div>
      <div class="upload-list-info">
        <div class="upload-list-name" title="${file.name}">${file.name}</div>
        <div class="upload-list-meta">${file.size || ''} · ${file.date ? formatDate(file.date) : ''}</div>
      </div>
      <span class="upload-list-open">Open ↗</span>
    </a>
  `).join('');
}

function fileIcon(name){ const ext=name.split('.').pop().toLowerCase(); const map={pdf:'📄',doc:'📝',docx:'📝',ppt:'📊',pptx:'📊',xls:'📈',xlsx:'📈',jpg:'🖼',jpeg:'🖼',png:'🖼',gif:'🖼',mp4:'🎬',zip:'🗜',rar:'🗜',py:'🐍',js:'⚡',html:'🌐'}; return map[ext]||'📁'; }

function getUploaderName(id){ const m=state.members.find(m=>m.id===id); return m?m.name:'Unknown'; }

function formatFileSize(bytes){ if(bytes<1024) return bytes+' B'; if(bytes<1048576) return (bytes/1024).toFixed(1)+' KB'; return (bytes/1048576).toFixed(1)+' MB'; }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1];
      resolve(base64);
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===== MEMBER ADD MODAL =====
function saveNewMember() {
  const name=document.getElementById('newMemberName').value.trim();
  const email=document.getElementById('newMemberEmail').value.trim().toLowerCase();
  const err=document.getElementById('memberError');
  err.textContent='';
  if (!name||!email) { err.textContent='Fill in all fields.'; return; }
  if (state.members.find(m=>m.email===email)) { err.textContent='Email already registered.'; return; }
  state.members.push({id:uid(),name,email,color:selectedColor,initials:makeInitials(name)});
  save(); closeAllModals(); renderMemberList(); renderAll();
  document.getElementById('newMemberName').value='';
  document.getElementById('newMemberEmail').value='';
}

function deleteMember(id, event) {
  if (event) event.stopPropagation();

  const member = state.members.find(m => m.id === id);
  if (!member) return;

  if (currentUser && currentUser.id === id) {
    alert('You cannot remove the currently logged-in user.');
    return;
  }

  const confirmed = confirm(`Remove member "${member.name}"?`);
  if (!confirmed) return;

  // Remove member
  state.members = state.members.filter(m => m.id !== id);

  // Unassign tasks owned by removed member
  state.tasks = state.tasks.map(task =>
    task.assignee === id ? { ...task, assignee: '' } : task
  );

  save().then(() => {
    renderAll();
  });
}

// ===== BADGES =====
function updateBadges() {
  const todoBadge=document.getElementById('taskBadge');
  const todo=state.tasks.filter(t=>t.status!=='done').length;
  todoBadge.textContent=todo;
  todoBadge.classList.toggle('show',todo>0);
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById('modalBackdrop').classList.add('show');
  const modal=document.getElementById(id);
  modal.style.display='flex';
  requestAnimationFrame(()=>modal.classList.add('show'));
}

function closeAllModals() {
  document.getElementById('modalBackdrop').classList.remove('show');
  document.querySelectorAll('.modal').forEach(m=>{
    m.classList.remove('show');
    setTimeout(()=>{ if(!m.classList.contains('show')) m.style.display='none'; },200);
  });
  editingId=null;
}

// Note: addResearch, renderResearch, deleteResearch are defined above near the research section