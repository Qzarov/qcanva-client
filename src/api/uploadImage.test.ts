// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { MAX_IMAGE_UPLOAD_BYTES, uploadImage } from "./client";

describe("uploadImage", () => {
  it("POSTs multipart to /canvas/files with auth and returns url", async () => {
    localStorage.setItem("token", "tok");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 201, json: async () => ({ key: "images/a.png", url: "https://x/api/canvas/files/images/a.png" }),
    } as any);
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const res = await uploadImage(file);
    expect(res.url).toContain("/api/canvas/files/");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3001/api/canvas/files");
    expect((init as any).method).toBe("POST");
    expect((init as any).headers.Authorization).toBe("Bearer tok");
    expect((init as any).body).toBeInstanceOf(FormData);
    fetchMock.mockRestore();
  });

  it("rejects an unsupported format before upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    await expect(uploadImage(file)).rejects.toMatchObject({
      status: 415,
      message: "Неподдерживаемый формат файла. Можно загрузить PNG, JPG, WEBP или GIF.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects a file larger than 50 MB before upload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const file = { name: "large.png", type: "image/png", size: MAX_IMAGE_UPLOAD_BYTES + 1 } as File;
    await expect(uploadImage(file)).rejects.toMatchObject({
      status: 413,
      message: "Файл слишком большой. Максимальный размер — 50 МБ.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
