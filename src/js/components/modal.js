// Universal Animated Modal Dialogs
import { api } from '../api.js';
import { toast } from './toast.js';
import { auth } from '../auth.js';

class ModalManager {
  close() {
    const existing = document.getElementById('app-modal-backdrop');
    if (existing) {
      existing.classList.add('toast-exit');
      setTimeout(() => existing.remove(), 200);
    }
  }

  // CREATE DISCUSSION MODAL
  async showCreateDiscussionModal({ defaultCategory = 'General', defaultCourseId = null, onCreated = null } = {}) {
    this.close();
    const user = auth.getUser();
    if (!user) {
      toast.error('Please log in to post a discussion.');
      return;
    }

    // Get user courses for dropdown
    const courses = user.courses || [];

    const categories = [
      'Questions', 'Course Discussion', 'Assignments', 'Exams',
      'Study Help', 'Resources', 'Study Groups', 'Campus Life',
      'Announcements', 'Projects', 'Career', 'General'
    ];

    const backdrop = document.createElement('div');
    backdrop.id = 'app-modal-backdrop';
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 style="font-size: 1.2rem; font-weight: 700;">Create a Discussion</h3>
          <button id="modal-close-btn" class="btn btn-ghost btn-icon" style="font-size: 1.2rem;">✕</button>
        </div>
        <form id="create-discussion-form">
          <div class="modal-body">
            <div class="input-group">
              <label class="input-label">Discussion Title *</label>
              <input type="text" id="disc-title" class="input-field" placeholder="What would you like to discuss or ask?" required autofocus />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="input-group">
                <label class="input-label">Category *</label>
                <select id="disc-category" class="select-field">
                  ${categories.map(c => `<option value="${c}" ${c === defaultCategory ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </div>

              <div class="input-group">
                <label class="input-label">Related Course (Optional)</label>
                <select id="disc-course" class="select-field">
                  <option value="">Institution-wide (No specific course)</option>
                  ${courses.map(c => `<option value="${c.id}" ${c.id === defaultCourseId ? 'selected' : ''}>${c.code} - ${c.name}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="input-group">
              <label class="input-label">Content / Body *</label>
              <textarea id="disc-body" class="textarea-field" placeholder="Provide full context, explain your question or share your knowledge..." required></textarea>
            </div>

            <div class="input-group">
              <label class="input-label">Tags (comma separated, e.g. midterm, calculus, lab-2)</label>
              <input type="text" id="disc-tags" class="input-field" placeholder="e.g. midterm, exam-prep, python" />
            </div>

            <div class="input-group">
              <label class="input-label">Optional Attachment / File</label>
              <input type="file" id="disc-file" class="input-field" style="padding: 0.5rem;" />
            </div>

            <div style="display: flex; align-items: center; gap: 0.625rem; margin-top: 0.5rem; background: var(--bg-surface-elevated); padding: 0.75rem 1rem; border-radius: var(--radius-md);">
              <input type="checkbox" id="disc-anonymous" style="width: 1.1rem; height: 1.1rem; accent-color: var(--brand-primary); cursor: pointer;" />
              <div>
                <label for="disc-anonymous" style="font-weight: 600; font-size: 0.875rem; cursor: pointer; display: block;">Post Anonymously</label>
                <span style="font-size: 0.75rem; color: var(--text-tertiary);">Your name will display as "Anonymous Student" to other students.</span>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button type="submit" id="modal-submit-btn" class="btn btn-primary">Post Discussion</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Event handlers
    backdrop.querySelector('#modal-close-btn').onclick = () => this.close();
    backdrop.querySelector('#modal-cancel-btn').onclick = () => this.close();
    backdrop.onclick = (e) => { if (e.target === backdrop) this.close(); };

    const form = backdrop.querySelector('#create-discussion-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = backdrop.querySelector('#modal-submit-btn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting...';

      try {
        const title = backdrop.querySelector('#disc-title').value.trim();
        const body = backdrop.querySelector('#disc-body').value.trim();
        const category = backdrop.querySelector('#disc-category').value;
        const course_id = backdrop.querySelector('#disc-course').value || null;
        const is_anonymous = backdrop.querySelector('#disc-anonymous').checked;
        const rawTags = backdrop.querySelector('#disc-tags').value;
        const tags = rawTags.split(',').map(t => t.trim()).filter(Boolean);

        let attachment_url = null;
        let attachment_name = null;
        const fileInput = backdrop.querySelector('#disc-file');
        if (fileInput.files && fileInput.files[0]) {
          submitBtn.textContent = 'Uploading file...';
          const uploadRes = await api.upload(fileInput.files[0]);
          attachment_url = uploadRes.url;
          attachment_name = uploadRes.name;
        }

        submitBtn.textContent = 'Publishing...';
        const res = await api.post('/discussions', {
          title,
          body,
          category,
          course_id,
          is_anonymous,
          tags,
          attachment_url,
          attachment_name
        });

        toast.success('Discussion posted successfully!');
        this.close();
        if (onCreated) onCreated(res.discussion);
        else window.location.href = `/pages/discussion.html?id=${res.discussion.id}`;
      } catch (err) {
        toast.error(err.message || 'Failed to post discussion.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Discussion';
      }
    };
  }

  // CREATE STUDY GROUP MODAL
  async showCreateGroupModal({ defaultCourseId = null, onCreated = null } = {}) {
    this.close();
    const user = auth.getUser();
    if (!user) return;

    const courses = user.courses || [];

    const backdrop = document.createElement('div');
    backdrop.id = 'app-modal-backdrop';
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 style="font-size: 1.2rem; font-weight: 700;">Create Study Group</h3>
          <button id="modal-close-btn" class="btn btn-ghost btn-icon">✕</button>
        </div>
        <form id="create-group-form">
          <div class="modal-body">
            <div class="input-group">
              <label class="input-label">Group Name *</label>
              <input type="text" id="grp-name" class="input-field" placeholder="e.g. Anatomy Exam Prep Crew" required />
            </div>

            <div class="input-group">
              <label class="input-label">Related Course (Optional)</label>
              <select id="grp-course" class="select-field">
                <option value="">General Program Study Group</option>
                ${courses.map(c => `<option value="${c.id}" ${c.id === defaultCourseId ? 'selected' : ''}>${c.code} - ${c.name}</option>`).join('')}
              </select>
            </div>

            <div class="input-group">
              <label class="input-label">Description & Goal</label>
              <textarea id="grp-desc" class="textarea-field" placeholder="What will this group focus on? (e.g. Weekly problem sets, reviewing lecture notes)"></textarea>
            </div>

            <div class="input-group">
              <label class="input-label">Max Members (Limit)</label>
              <input type="number" id="grp-max" class="input-field" value="20" min="2" max="100" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button type="submit" id="modal-submit-btn" class="btn btn-primary">Create Group</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.querySelector('#modal-close-btn').onclick = () => this.close();
    backdrop.querySelector('#modal-cancel-btn').onclick = () => this.close();
    backdrop.onclick = (e) => { if (e.target === backdrop) this.close(); };

    const form = backdrop.querySelector('#create-group-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const submitBtn = backdrop.querySelector('#modal-submit-btn');
      submitBtn.disabled = true;

      try {
        const name = backdrop.querySelector('#grp-name').value.trim();
        const description = backdrop.querySelector('#grp-desc').value.trim();
        const course_id = backdrop.querySelector('#grp-course').value || null;
        const max_members = parseInt(backdrop.querySelector('#grp-max').value, 10) || 20;

        const res = await api.post('/groups', { name, description, course_id, max_members });
        toast.success('Study group created!');
        this.close();
        if (onCreated) onCreated(res.group);
        else window.location.href = `/pages/group.html?id=${res.group.id}`;
      } catch (err) {
        toast.error(err.message || 'Failed to create group.');
        submitBtn.disabled = false;
      }
    };
  }

  // REPORT CONTENT MODAL
  showReportModal({ targetType, targetId, targetName = 'content' }) {
    this.close();
    const backdrop = document.createElement('div');
    backdrop.id = 'app-modal-backdrop';
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal-dialog" style="max-width: 480px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem; font-weight: 700;">Report Inappropriate Content</h3>
          <button id="modal-close-btn" class="btn btn-ghost btn-icon">✕</button>
        </div>
        <form id="report-form">
          <div class="modal-body">
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1rem;">
              Please select the primary reason for reporting this ${targetName}.
            </p>
            <div class="input-group">
              <label class="input-label">Reason *</label>
              <select id="report-reason" class="select-field" required>
                <option value="Academic Dishonesty / Cheating">Academic Dishonesty / Cheating</option>
                <option value="Harassment or Hate Speech">Harassment or Hate Speech</option>
                <option value="Spam or Promotion">Spam or Promotion</option>
                <option value="Misinformation / False Info">Misinformation / False Info</option>
                <option value="Off-Topic or Inappropriate">Off-Topic or Inappropriate</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Additional Details (Optional)</label>
              <textarea id="report-details" class="textarea-field" placeholder="Provide extra context to help moderators..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
            <button type="submit" id="modal-submit-btn" class="btn btn-danger">Submit Report</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.querySelector('#modal-close-btn').onclick = () => this.close();
    backdrop.querySelector('#modal-cancel-btn').onclick = () => this.close();
    backdrop.onclick = (e) => { if (e.target === backdrop) this.close(); };

    const form = backdrop.querySelector('#report-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const reason = backdrop.querySelector('#report-reason').value;
        const details = backdrop.querySelector('#report-details').value;
        await api.post('/admin/reports', { target_type: targetType, target_id: targetId, reason, details });
        toast.success('Report submitted. Our moderation team has been notified.');
        this.close();
      } catch (err) {
        toast.error(err.message || 'Failed to submit report.');
      }
    };
  }

  // CONFIRMATION DIALOG
  showConfirmModal({ title = 'Are you sure?', message = 'This action cannot be undone.', confirmText = 'Confirm', isDanger = false, onConfirm }) {
    this.close();
    const backdrop = document.createElement('div');
    backdrop.id = 'app-modal-backdrop';
    backdrop.className = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal-dialog" style="max-width: 440px;">
        <div class="modal-header">
          <h3 style="font-size: 1.15rem; font-weight: 700;">${title}</h3>
          <button id="modal-close-btn" class="btn btn-ghost btn-icon">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.9375rem; color: var(--text-secondary); line-height: 1.5;">${message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" id="modal-cancel-btn" class="btn btn-secondary">Cancel</button>
          <button type="button" id="modal-confirm-btn" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    backdrop.querySelector('#modal-close-btn').onclick = () => this.close();
    backdrop.querySelector('#modal-cancel-btn').onclick = () => this.close();
    backdrop.onclick = (e) => { if (e.target === backdrop) this.close(); };

    backdrop.querySelector('#modal-confirm-btn').onclick = () => {
      this.close();
      if (onConfirm) onConfirm();
    };
  }
}

export const modal = new ModalManager();
