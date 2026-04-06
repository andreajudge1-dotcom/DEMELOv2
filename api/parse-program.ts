import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { documentText, documentName } = req.body ?? {}
  if (!documentText) {
    return res.status(400).json({ error: 'Missing documentText' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: 'You are a fitness program parser. Extract the complete training program structure from this document and return only valid JSON with no other text, markdown, or explanation.',
        messages: [
          {
            role: 'user',
            content: `Parse this training document "${documentName}" and return a JSON object with this exact structure:

{
  "program_name": "string",
  "weeks": number,
  "days": [
    {
      "day_number": number,
      "day_name": "string",
      "focus": "string describing the training focus such as Lower Glute or Shoulders Arms",
      "exercises": [
        {
          "name": "string",
          "superset_with": "string or null",
          "coaching_notes": "string with any notes from the document",
          "sets": [
            {
              "set_number": number,
              "reps_min": number,
              "reps_max": number,
              "set_type": "working | drop | amrap | bodyweight",
              "special_instructions": "string or null for any special techniques like drop sets holds or pulses"
            }
          ]
        }
      ]
    }
  ]
}

Here is the document text:

${documentText}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Claude API error:', response.status, errBody)
      return res.status(502).json({ error: `Claude API error: ${response.status} — ${errBody.substring(0, 200)}` })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''
    const stopReason = data.stop_reason ?? 'unknown'

    console.log('Claude response length:', text.length, 'stop_reason:', stopReason)
    console.log('Claude response first 300 chars:', text.substring(0, 300))

    // If the response was cut off, the JSON is incomplete
    if (stopReason === 'max_tokens') {
      return res.status(422).json({ error: 'AI response was truncated — document may be too complex. Try a simpler program document.' })
    }

    if (!text) {
      return res.status(422).json({ error: 'AI returned empty response' })
    }

    // Try to parse JSON from response — handle markdown, extra text, etc.
    let parsed
    try {
      // Strip markdown code blocks
      let jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

      // If still not valid JSON, try to find JSON object in the text
      if (!jsonStr.startsWith('{')) {
        const firstBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
        }
      }

      parsed = JSON.parse(jsonStr)
    } catch (parseErr: any) {
      console.error('JSON parse failed:', parseErr.message)
      console.error('Attempted to parse:', text.substring(0, 500))
      return res.status(422).json({ error: `Failed to parse AI response: ${parseErr.message}. Response started with: ${text.substring(0, 100)}` })
    }

    return res.status(200).json(parsed)
  } catch (err: any) {
    console.error('Parse program error:', err)
    return res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
}
