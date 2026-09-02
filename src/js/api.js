// UniCircle Unified API Client
import { API_BASE } from './config.js';
import { toast } from './components/toast.js';

class ApiClient {
  getToken() {
    return localStorage.getItem('unicircle_token');
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
    const token = this.getToken();

    const headers = {
      ...options.headers
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // If unauthorized and on a protected page, handle session expiration
        if (response.status === 401 && !window.location.pathname.includes('login.html') && !window.location.pathname.includes('signup.html') && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
          localStorage.removeItem('unicircle_token');
          localStorage.removeItem('unicircle_user');
          window.location.href = '/pages/login.html?expired=1';
          throw new Error(data.error || 'Session expired. Please log in again.');
        }

        const errorMessage = data.error || `Request failed with status ${response.status}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  }

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  }

  delete(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      body: JSON.stringify(body)
    });
  }

  // Upload file
  async upload(file) {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers,
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  }
}

export const api = new ApiClient();
