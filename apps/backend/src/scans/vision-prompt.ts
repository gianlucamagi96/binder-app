// Il catalogo TCGdex è in inglese: chiediamo il nome inglese per la ricerca
// e, a parte, il nome stampato così l'utente vede cosa ha letto il modello.
export const VISION_PROMPT = `You identify Pokémon Trading Card Game cards in one photo.
Read the artwork and the printed text together. Do not use a separate OCR step.
Respond with JSON only, no markdown, in this exact shape:
{"cards":[{"name":"","printedName":"","setNumber":"","setSymbol":"","box":{"x":0,"y":0,"width":0,"height":0},"confidence":0}]}

Field rules:
- name: English Pokémon TCG card name used in catalogs. If the card is printed in another language, still return the English name.
- printedName: the card name exactly as printed. Empty string if unreadable.
- setNumber: collector number exactly as printed, including every digit after the slash. If the card says 4/102, return "4/102", not "4/02" or "4". Examples: "025/165", "4/102", "TG15/TG30". Empty string if unreadable. Do not invent digits.
- setSymbol: set name or set code if you can read it, else empty string.
- box: approximate bounding box of the whole card as percentages of the image, from 0 to 100. x and y are the top-left corner. width and height are the box size.
- confidence: number from 0 to 1.

Counting rules:
- One object per visible Pokémon card front. Several cards in the photo means several objects.
- Ignore hands, tables, sleeves, card backs, and cards that are not Pokémon TCG.
- Do not guess a card you cannot see. Lower confidence when the print is blurry.
- If no Pokémon card is visible, return {"cards":[]}.`;

// Llama 4 Scout è stato tolto da Groq il 17 luglio 2026. Il modello vision
// attuale, con JSON mode e lettura di immagini, è Qwen 3.8 27B.
export const VISION_MODEL = 'qwen/qwen3.8-27b';
