import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { documentText: rawText, documentName } = req.body ?? {}
  if (!rawText) {
    return res.status(400).json({ error: 'Missing documentText' })
  }

  // Truncate to ~15k chars to leave room for the response within token limits
  const documentText = rawText.length > 15000 ? rawText.substring(0, 15000) + '\n\n[Document truncated — parse what is shown above]' : rawText

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
        max_tokens: 16384,
        system: 'You are a fitness program parser. Extract the complete weekly training schedule from this document. Capture EVERY set listed for every exercise — including warm-up sets, feeder sets, activation sets, and working sets. Do not skip or merge any sets. Return only valid JSON with no other text, markdown, or explanation.',
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
      "focus": "string describing the training focus e.g. Lower Glute or Shoulders Arms",
      "exercises": [
        {
          "name": "string",
          "superset_with": "string or null — name of the exercise this is paired with if it is a superset",
          "coaching_notes": "string — any pro tips or coaching notes from the document for this exercise",
          "sets": [
            {
              "set_number": number,
              "reps_min": number,
              "reps_max": number,
              "set_type": "warmup | working | backoff | drop | amrap | myorep | tempo | pause",
              "special_instructions": "string or null — any techniques like drop sets, holds, pulses, ISO holds, pauses"
            }
          ]
        }
      ]
    }
  ]
}

SET TYPE RULES — apply these exactly:
- "warmup": any set described as warm-up, feeder set, activation set, primer set, or prep set
- "working": standard working sets (Working Set 1, Working Set 2, etc.)
- "backoff": back-off sets, down sets, or sets at reduced weight after the main work
- "drop": drop sets or any set where weight is immediately reduced and reps continue
- "amrap": as many reps as possible sets
- "myorep": myo-rep or rest-pause sets
- "tempo": sets with prescribed tempo e.g. 3-1-1
- "pause": sets with a pause or hold at a specific point in the movement

SET COUNTING RULES — critical:
- If an exercise lists "1 warm-up/feeder set", include it as set_number 1 with set_type "warmup"
- If it then lists Working Set 1, Working Set 2, Working Set 3 — those become set_number 2, 3, 4
- NEVER skip a set. If 4 sets are listed (1 warm-up + 3 working), output exactly 4 set objects
- If rep counts are not specified for warm-up/feeder sets, use reps_min: 12, reps_max: 15 as a default
- If a set says "Drop set both arms on last set", mark that set's set_type as "drop"

Here is the document text:

${documentText}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Claude API error:', response.status, errBody)
      if (response.status === 529) {
        return res.status(503).json({ error: 'The AI service is temporarily overloaded. Please wait a moment and try again.' })
      }
      if (response.status === 429) {
        return res.status(503).json({ error: 'API rate limit reached. Please wait a minute and try again.' })
      }
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
