export const analyzeFrame = async (frameBase64, zones) => {
  const { tray, incision } = zones;
  
  const prompt = `Count all surgical instruments, specify their type and X/Y coordinates, and determine if each is in tray zone (${tray.x1}-${tray.x2}, ${tray.y1}-${tray.y2}) or incision zone (${incision.x1}-${incision.x2}, ${incision.y1}-${incision.y2}). Return JSON with format: {items: [{type, x, y, zone}], tray_count, incision_count}`;

  try {
    const response = await fetch('https://api.overshoot.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Assuming we might need an API key, but user didn't provide one. 
        // Often these APIs need an Authorization header. 
        // I will add a placeholder or check env vars.
        'Authorization': `Bearer ${import.meta.env.VITE_OVERSHOOT_API_KEY || ''}`
      },
      body: JSON.stringify({
        model: "overshoot-v1", // User didn't specify model name, assuming default or generic
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: frameBase64 } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("Error analyzing frame:", error);
    return null;
  }
};
