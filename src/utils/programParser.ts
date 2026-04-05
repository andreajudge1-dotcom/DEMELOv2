import mammoth from 'mammoth'

export interface ParsedProgram {
  program_name: string
  weeks: number
  days: {
    day_number: number
    day_name: string
    focus: string
    exercises: {
      name: string
      superset_with: string | null
      coaching_notes: string
      sets: {
        set_number: number
        reps_min: number
        reps_max: number
        set_type: 'working' | 'drop' | 'amrap' | 'bodyweight'
        special_instructions: string | null
      }[]
    }[]
  }[]
}

export type ParseResult = {
  success: true
  data: ParsedProgram
} | {
  success: false
  error: string
}

/**
 * Parses a training document from a URL into a structured program.
 * Supports DOCX (via mammoth) and plain text extraction.
 */
export async function parseTrainingDocument(
  documentUrl: string,
  documentName: string
): Promise<ParseResult> {
  try {
    // Step 1 — Fetch and extract text
    const ext = documentName.split('.').pop()?.toLowerCase() ?? ''
    let documentText = ''

    if (ext === 'docx' || ext === 'doc') {
      const response = await fetch(documentUrl)
      if (!response.ok) return { success: false, error: 'Failed to fetch document' }
      const arrayBuffer = await response.arrayBuffer()
      const result = await mammoth.extractRawText({ arrayBuffer })
      documentText = result.value
    } else if (ext === 'pdf') {
      // PDF text extraction is limited in browser — send URL info
      const response = await fetch(documentUrl)
      if (!response.ok) return { success: false, error: 'Failed to fetch document' }
      const text = await response.text()
      if (text.startsWith('%PDF')) {
        return { success: false, error: 'PDF text extraction requires server-side processing. Please upload a DOCX version instead.' }
      }
      documentText = text
    } else {
      // Try plain text
      const response = await fetch(documentUrl)
      if (!response.ok) return { success: false, error: 'Failed to fetch document' }
      documentText = await response.text()
    }

    if (!documentText.trim()) {
      return { success: false, error: 'Could not extract text from this document.' }
    }

    // Step 2 — Send to Claude via serverless function
    const apiResponse = await fetch('/api/parse-program', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentText, documentName }),
    })

    if (!apiResponse.ok) {
      const errData = await apiResponse.json().catch(() => ({}))
      return { success: false, error: (errData as any).error ?? `API error: ${apiResponse.status}` }
    }

    // Step 3 — Return parsed result
    const parsed = await apiResponse.json()
    return { success: true, data: parsed as ParsedProgram }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Unknown error during parsing' }
  }
}
