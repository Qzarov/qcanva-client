export type HtmlDocumentDownload = {
  filename: string;
  blob: Blob;
};

export function createHtmlDocumentDownload(title: string, html: string): HtmlDocumentDownload {
  const filenameBase = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return {
    filename: `${filenameBase || 'html-document'}.html`,
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
  };
}

export function downloadHtmlDocument(title: string, html: string) {
  const { filename, blob } = createHtmlDocumentDownload(title, html);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
