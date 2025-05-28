const API_URL = 'http://localhost:4000/api';

export const register = async (email: string, password: string, name: string) => {
  const res = await fetch(`${API_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  if (!res.ok) throw new Error('Ошибка регистрации');
  return res.json(); // { token }
};

export const login = async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error('Ошибка входа');
  return res.json(); // { token }
};

export const fetchProfile = async (token: string) => {
  const res = await fetch(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Ошибка получения профиля');
  return res.json(); // { email, name }
};

export const getGenerations = async (token: string) => {
  const res = await fetch(`${API_URL}/generations`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Ошибка загрузки истории');
  return res.json();
};

export const postGeneration = async (
  token: string,
  regionKey: string,
  stars: any[]
) => {
  const res = await fetch(`${API_URL}/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ regionKey, stars })
  });
  if (!res.ok) throw new Error('Ошибка сохранения');
  return res.json();
};

export const deleteGeneration = async (token: string, id: string) => {
  const res = await fetch(`${API_URL}/generations/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Ошибка удаления');
};

export const deleteAllGenerations = async (token: string) => {
  const res = await fetch(`${API_URL}/generations`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Ошибка удаления всех');
};

export const updateName = async (token: string, name: string) => {
  const res = await fetch(`${API_URL}/profile/name`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Ошибка обновления имени');
};
