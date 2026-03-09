import client from "./client";

export const usersApi = {
  list:       (params) => client.get("/users/", { params }),
  get:        (id)     => client.get(`/users/${id}`),
  create:     (data)   => client.post("/users/", data),
  update:     (id, d)  => client.put(`/users/${id}`, d),
  deactivate: (id)     => client.delete(`/users/${id}`),
};
