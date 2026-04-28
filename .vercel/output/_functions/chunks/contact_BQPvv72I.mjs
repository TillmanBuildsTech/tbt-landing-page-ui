import 'resend';

const prerender = false;
const POST = async ({ request }) => {
  {
    return new Response(JSON.stringify({ error: "Server misconfiguration." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
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
