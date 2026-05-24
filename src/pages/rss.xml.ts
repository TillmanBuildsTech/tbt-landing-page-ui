import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', ({ id, data }) =>
    !data.draft && !id.startsWith('archive/')
  )).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: 'TillmanBuildsTech — Writing',
    description: 'Practical posts on AI, automation, DevOps, and engineering.',
    site: context.site ?? 'https://tillmanbuildstech.com',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: `/writing/${post.id}/`,
    })),
  });
}
