// Onboarding Wizard Controller
import { initTheme } from '../config.js';
import { api } from '../api.js';
import { auth } from '../auth.js';
import { toast } from '../components/toast.js';

initTheme();

let currentStep = 1;
const totalSteps = 6;

// Selected Onboarding State
const state = {
  name: '',
  bio: '',
  institution_id: null,
  institution_name: '',
  faculty_id: null,
  faculty_name: '',
  program_id: null,
  program_name: '',
  academic_year: 'Year 1',
  selected_course_ids: new Set()
};

async function init() {
  if (!auth.isAuthenticated()) {
    window.location.href = '/pages/login.html';
    return;
  }

  const user = await auth.fetchCurrentUser();
  if (user) {
    state.name = user.name || '';
    state.bio = user.bio || '';
    document.getElementById('ob-name').value = state.name;
    document.getElementById('ob-bio').value = state.bio;
  }

  setupEventListeners();
  loadInstitutions();
}

function updateProgress() {
  // Update progress line fill percentage
  const fill = document.getElementById('progress-fill');
  const percent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  fill.style.width = `${percent}%`;

  // Update node classes
  document.querySelectorAll('.step-node').forEach(node => {
    const stepNum = parseInt(node.dataset.step, 10);
    if (stepNum < currentStep) {
      node.className = 'step-node completed';
      node.innerHTML = '✓';
    } else if (stepNum === currentStep) {
      node.className = 'step-node active';
      node.innerHTML = `${stepNum}`;
    } else {
      node.className = 'step-node';
      node.innerHTML = `${stepNum}`;
    }
  });

  // Switch active card step
  document.querySelectorAll('.onboarding-step').forEach(stepEl => {
    stepEl.classList.remove('active');
  });

  const activeCard = document.getElementById(`step-${currentStep}`);
  if (activeCard) activeCard.classList.add('active');
}

function setupEventListeners() {
  // STEP 1
  document.getElementById('step-1-next').onclick = async () => {
    const name = document.getElementById('ob-name').value.trim();
    const bio = document.getElementById('ob-bio').value.trim();

    if (!name) {
      toast.error('Please enter your display name.');
      return;
    }

    state.name = name;
    state.bio = bio;
    await api.put('/auth/profile', { name, bio });

    currentStep = 2;
    updateProgress();
  };

  // STEP 2: Institution
  document.getElementById('step-2-back').onclick = () => {
    currentStep = 1;
    updateProgress();
  };

  document.getElementById('step-2-next').onclick = () => {
    if (!state.institution_id) {
      toast.error('Please select or add your university.');
      return;
    }
    loadFaculties();
    currentStep = 3;
    updateProgress();
  };

  document.getElementById('inst-search-input').oninput = (e) => {
    loadInstitutions(e.target.value);
  };

  document.getElementById('add-inst-btn').onclick = async () => {
    const name = document.getElementById('new-inst-name').value.trim();
    const short_code = document.getElementById('new-inst-code').value.trim();
    if (!name) {
      toast.error('Please enter the university name.');
      return;
    }
    try {
      const res = await api.post('/academic/institutions', { name, short_code });
      toast.success(`Added ${res.institution.name}!`);
      state.institution_id = res.institution.id;
      state.institution_name = res.institution.name;
      document.getElementById('new-inst-name').value = '';
      document.getElementById('new-inst-code').value = '';
      await loadInstitutions();
      document.getElementById('step-2-next').disabled = false;
    } catch (err) {
      toast.error(err.message || 'Failed to add institution.');
    }
  };

  // STEP 3: Faculty
  document.getElementById('step-3-back').onclick = () => {
    currentStep = 2;
    updateProgress();
  };

  document.getElementById('step-3-next').onclick = () => {
    if (!state.faculty_id) {
      toast.error('Please select or add your faculty/school.');
      return;
    }
    loadPrograms();
    currentStep = 4;
    updateProgress();
  };

  document.getElementById('add-fac-btn').onclick = async () => {
    const name = document.getElementById('new-fac-name').value.trim();
    if (!name) {
      toast.error('Please enter the faculty/school name.');
      return;
    }
    try {
      const res = await api.post(`/academic/institutions/${state.institution_id}/faculties`, { name });
      toast.success(`Added ${res.faculty.name}!`);
      state.faculty_id = res.faculty.id;
      state.faculty_name = res.faculty.name;
      document.getElementById('new-fac-name').value = '';
      await loadFaculties();
      document.getElementById('step-3-next').disabled = false;
    } catch (err) {
      toast.error(err.message || 'Failed to add faculty.');
    }
  };

  // STEP 4: Program
  document.getElementById('step-4-back').onclick = () => {
    currentStep = 3;
    updateProgress();
  };

  document.getElementById('step-4-next').onclick = () => {
    if (!state.program_id) {
      toast.error('Please select or add your program.');
      return;
    }
    currentStep = 5;
    updateProgress();
  };

  document.getElementById('add-prog-btn').onclick = async () => {
    const name = document.getElementById('new-prog-name').value.trim();
    if (!name) {
      toast.error('Please enter the degree program name.');
      return;
    }
    try {
      const res = await api.post(`/academic/faculties/${state.faculty_id}/programs`, { name });
      toast.success(`Added ${res.program.name}!`);
      state.program_id = res.program.id;
      state.program_name = res.program.name;
      document.getElementById('new-prog-name').value = '';
      await loadPrograms();
      document.getElementById('step-4-next').disabled = false;
    } catch (err) {
      toast.error(err.message || 'Failed to add program.');
    }
  };

  // STEP 5: Year
  document.getElementById('step-5-back').onclick = () => {
    currentStep = 4;
    updateProgress();
  };

  document.querySelectorAll('#years-list .selection-item').forEach(item => {
    item.onclick = () => {
      document.querySelectorAll('#years-list .selection-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      state.academic_year = item.dataset.year;
      document.getElementById('step-5-next').disabled = false;
    };
  });

  document.getElementById('step-5-next').onclick = () => {
    loadCourses();
    currentStep = 6;
    updateProgress();
  };

  // STEP 6: Courses & Finish
  document.getElementById('step-6-back').onclick = () => {
    currentStep = 5;
    updateProgress();
  };

  document.getElementById('add-course-btn').onclick = async () => {
    const code = document.getElementById('new-course-code').value.trim();
    const name = document.getElementById('new-course-name').value.trim();
    if (!code || !name) {
      toast.error('Course code and name are required.');
      return;
    }
    try {
      const res = await api.post(`/academic/programs/${state.program_id}/courses`, {
        code,
        name,
        academic_year: state.academic_year
      });
      toast.success(`Added ${res.course.code}!`);
      state.selected_course_ids.add(res.course.id);
      document.getElementById('new-course-code').value = '';
      document.getElementById('new-course-name').value = '';
      await loadCourses();
    } catch (err) {
      toast.error(err.message || 'Failed to add course.');
    }
  };

  document.getElementById('step-6-finish').onclick = async () => {
    const finishBtn = document.getElementById('step-6-finish');
    finishBtn.disabled = true;
    finishBtn.textContent = 'Saving academic identity...';

    try {
      await api.put('/auth/academic', {
        institution_id: state.institution_id,
        faculty_id: state.faculty_id,
        program_id: state.program_id,
        academic_year: state.academic_year,
        course_ids: Array.from(state.selected_course_ids)
      });

      // Show completion screen
      document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
      document.getElementById('step-complete').classList.add('active');
    } catch (err) {
      toast.error(err.message || 'Failed to complete setup.');
      finishBtn.disabled = false;
      finishBtn.textContent = 'Complete Setup & Launch 🚀';
    }
  };

  document.getElementById('enter-home-btn').onclick = () => {
    window.location.href = '/pages/home.html';
  };
}

// Data loaders
async function loadInstitutions(query = '') {
  const list = document.getElementById('institutions-list');
  try {
    const res = await api.get('/academic/institutions', { q: query });
    if (!res.institutions || res.institutions.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-tertiary); font-size: 0.875rem;">
          No institutions found. Add yours below!
        </div>
      `;
      return;
    }

    list.innerHTML = res.institutions.map(inst => `
      <div class="selection-item ${state.institution_id === inst.id ? 'selected' : ''}" data-id="${inst.id}" data-name="${inst.name}">
        <div>
          <div style="font-weight: 700; color: var(--text-primary);">${inst.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-tertiary);">${inst.short_code ? inst.short_code + ' • ' : ''}${inst.student_count || 0} students</div>
        </div>
        <span>🏛️</span>
      </div>
    `).join('');

    list.querySelectorAll('.selection-item').forEach(item => {
      item.onclick = () => {
        list.querySelectorAll('.selection-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        state.institution_id = item.dataset.id;
        state.institution_name = item.dataset.name;
        document.getElementById('step-2-next').disabled = false;
      };
    });
  } catch (err) {
    console.error('Failed to load institutions:', err);
  }
}

async function loadFaculties() {
  const list = document.getElementById('faculties-list');
  try {
    const res = await api.get(`/academic/institutions/${state.institution_id}/faculties`);
    if (!res.faculties || res.faculties.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-tertiary); font-size: 0.875rem;">
          No faculties added yet for ${state.institution_name}. Add yours below!
        </div>
      `;
      return;
    }

    list.innerHTML = res.faculties.map(fac => `
      <div class="selection-item ${state.faculty_id === fac.id ? 'selected' : ''}" data-id="${fac.id}" data-name="${fac.name}">
        <div style="font-weight: 700; color: var(--text-primary);">${fac.name}</div>
        <span>🔬</span>
      </div>
    `).join('');

    list.querySelectorAll('.selection-item').forEach(item => {
      item.onclick = () => {
        list.querySelectorAll('.selection-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        state.faculty_id = item.dataset.id;
        state.faculty_name = item.dataset.name;
        document.getElementById('step-3-next').disabled = false;
      };
    });
  } catch (err) {
    console.error('Failed to load faculties:', err);
  }
}

async function loadPrograms() {
  const list = document.getElementById('programs-list');
  try {
    const res = await api.get(`/academic/faculties/${state.faculty_id}/programs`);
    if (!res.programs || res.programs.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-tertiary); font-size: 0.875rem;">
          No degree programs found for ${state.faculty_name}. Add yours below!
        </div>
      `;
      return;
    }

    list.innerHTML = res.programs.map(prog => `
      <div class="selection-item ${state.program_id === prog.id ? 'selected' : ''}" data-id="${prog.id}" data-name="${prog.name}">
        <div style="font-weight: 700; color: var(--text-primary);">${prog.name}</div>
        <span>📚</span>
      </div>
    `).join('');

    list.querySelectorAll('.selection-item').forEach(item => {
      item.onclick = () => {
        list.querySelectorAll('.selection-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        state.program_id = item.dataset.id;
        state.program_name = item.dataset.name;
        document.getElementById('step-4-next').disabled = false;
      };
    });
  } catch (err) {
    console.error('Failed to load programs:', err);
  }
}

async function loadCourses() {
  const list = document.getElementById('courses-list');
  try {
    const res = await api.get(`/academic/programs/${state.program_id}/courses`);
    if (!res.courses || res.courses.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--text-tertiary); font-size: 0.875rem;">
          No courses listed yet for this program. Add your current courses below!
        </div>
      `;
      return;
    }

    list.innerHTML = res.courses.map(crs => {
      const isSelected = state.selected_course_ids.has(crs.id);
      return `
        <div class="selection-item ${isSelected ? 'selected' : ''}" data-id="${crs.id}">
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">
              <span class="badge badge-course" style="margin-right: 0.5rem;">${crs.code}</span>
              ${crs.name}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary);">${crs.academic_year}</div>
          </div>
          <span>${isSelected ? '✅' : '➕'}</span>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.selection-item').forEach(item => {
      item.onclick = () => {
        const id = item.dataset.id;
        if (state.selected_course_ids.has(id)) {
          state.selected_course_ids.delete(id);
          item.classList.remove('selected');
          item.querySelector('span:last-child').textContent = '➕';
        } else {
          state.selected_course_ids.add(id);
          item.classList.add('selected');
          item.querySelector('span:last-child').textContent = '✅';
        }
      };
    });
  } catch (err) {
    console.error('Failed to load courses:', err);
  }
}

init();
