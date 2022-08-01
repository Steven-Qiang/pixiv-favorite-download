/**
 * @file: download.js
 * @description: download.js
 * @package: pixiv-favorite-download
 * @create: 2021-12-29 12:52:26
 * @author: qiangmouren (2962051004@qq.com)
 * -----
 * @last-modified: 2022-08-01 03:08:09
 * -----
 */

const Queue = require('p-queue').default;
const axios = require('axios').default;
const queue_01 = new Queue({ concurrency: 3 });
const queue_02 = new Queue({ concurrency: 3 }); // 下载队列

const fs = require('fs');
const path = require('path');
const config = require('./config.json');

let instance;
const output = path.resolve(config.output);
const proxy = config.proxy?.host ? config.proxy : null;

(async () => {
  if (!fs.existsSync(output)) await fs.promises.mkdir(output);
  instance = axios.create({
    validateStatus: false,
    proxy,
    headers: {
      cookie: config.cookie,
      referer: 'https://www.pixiv.net/',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36',
    },
  });
  try {
    const works = await bookmarks();
    console.log('获取收藏成功，共', works.length, '条');
    works.forEach((work) =>
      queue_01.add(async () => {
        const pages = await illust_pages(work.id);
        if (pages) {
          console.log('下载', work.id, work.title, '共', pages.length, '页');
          pages.forEach((page) => queue_02.add(() => download(page.urls.original)));
        }
      })
    );
  } catch (error) {
    console.log(error);
  }
})();

async function download(url) {
  const base = path.basename(url);
  const file = path.join(output, base);
  if (fs.existsSync(file)) {
    console.log(base, '已存在');
    return;
  }
  const resp = await instance.request({
    url,
    method: 'get',
    responseType: 'stream',
  });
  resp.data.pipe(fs.createWriteStream(file));
  console.log('下载成功', base);
}

async function illust_pages(id) {
  const resp = await instance.request({
    url: `https://www.pixiv.net/ajax/illust/${id}/pages?lang=zh`,
    method: 'get',
  });
  if (resp.data.error) {
    console.log(id, resp.data.message);
    return null;
  }
  return resp.data.body;
}

async function bookmarks() {
  let works = [];
  async function _(page = 1) {
    console.log('获取第', page, '页收藏');
    const offset = (page - 1) * 100;
    const user_id = await instance
      .get('https://www.pixiv.net/bookmark.php', { maxRedirects: 0 })
      .then(({ headers }) => headers.location.split('/')[2]);
    const resp = await instance.request({
      url: `https://www.pixiv.net/ajax/user/${user_id}/illusts/bookmarks`,
      method: 'get',
      params: {
        tag: '',
        offset,
        limit: 100,
        rest: 'show',
        lang: 'zh',
      },
    });
    const body = resp.data.body;
    works = works.concat(body.works);
    if (body.total > offset + 100) {
      page++;
      await _(page);
    }
  }
  await _();
  return works;
}
