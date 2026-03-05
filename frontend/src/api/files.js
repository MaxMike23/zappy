import client from "./client";

export const filesApi = {
  list:     (params)   => client.get("/files/", { params }),
  upload:   (formData) => client.post("/files/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }),
  download: (id)       => client.get(`/files/${id}/download`, { responseType: "blob" }),
  delete:   (id)       => client.delete(`/files/${id}`),
};
