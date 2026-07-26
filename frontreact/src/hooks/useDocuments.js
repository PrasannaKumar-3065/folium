/**
 * useDocuments — reusable hook for fetching the document list.
 *
 * Used by Upload, QuestionPapers, and QuestionBank so they all share
 * the same fetching logic without duplicating it.
 *
 * @param {object} options
 * @param {boolean} options.readyOnly  When true, only returns documents
 *                                     whose status === 'ready'.
 */
import { useState, useCallback } from 'react'
import { apiGet } from '../lib/api.js'

export function useDocuments({ readyOnly = false } = {}) {
  const [docs, setDocs] = useState([])

  const load = useCallback(async () => {
    try {
      const { data } = await apiGet('/documents')
      if (Array.isArray(data)) {
        setDocs(readyOnly ? data.filter(d => d.status === 'ready') : data)
      }
    } catch { /* backend not connected */ }
  }, [readyOnly])

  return { docs, load }
}
