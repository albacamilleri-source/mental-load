export async function extractionErrorMessage(error) {
  const response = error?.context;
  if (response && typeof response.json === 'function') {
    try {
      const body = await (typeof response.clone === 'function' ? response.clone() : response).json();
      const message = typeof body?.error === 'string' ? body.error : body?.error?.message || body?.message;
      if (typeof message === 'string' && message.trim()) return message;
    } catch {
      // A gateway error may return HTML or no body; keep a useful fallback.
    }
    return `Ingredient extraction failed${response.status ? ` (HTTP ${response.status})` : ''}. Please try again.`;
  }
  if (error?.name === 'FunctionsFetchError') return 'Could not reach ingredient extraction. Check your connection and try again.';
  return error?.message || 'Ingredient extraction failed. Please try again.';
}
