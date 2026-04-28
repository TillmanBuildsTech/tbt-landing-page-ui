const prerender = false;
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
const POST = async ({ request }) => {
  let data;
  try {
    data = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const email = data.get("email")?.trim() ?? "";
  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ error: "A valid email address is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  console.log("Newsletter subscription:", email);
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
const ALL = () => new Response(JSON.stringify({ error: "Method not allowed." }), {
  status: 405,
  headers: { "Content-Type": "application/json" }
});

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  ALL,
  POST,
  prerender
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
