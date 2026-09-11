import type { Plugin } from "vite";
import { API_PREFIX } from "./constants.js";
import { createEditApiMiddleware } from "./api.js";
import { validateEnvironment } from "./guard.js";

/**
 * 本地知识内容编辑插件。
 *
 * 设计要点：
 * - `apply: "serve"`：仅在 `vuepress dev` 生效，`vuepress build` 产物
 *   物理上不包含任何编辑 API，"仅本地使用"由架构保证；
 * - 通过 `define` 向客户端注入 `__EDIT_API_BASE__`（仅 dev 存在），
 *   使客户端代码无需硬编码 API 路径，构建产物 grep 不到该字符串；
 * - 中间件挂载在 Vite dev server 上，与站点同端口同源，无 CORS 问题；
 * - 文件写回后由 VuePress 自身的文件监听触发 HMR，左侧页面即实时预览。
 *
 * @returns Vite 插件对象（挂载到 viteOptions.plugins）
 */
export function docsEditPlugin(): Plugin {
  return {
    name: "javaguide-docs-edit",
    apply: "serve",
    config() {
      return {
        define: {
          // 仅 dev 存在；prod 构建中该标识符未被定义，
          // 客户端以 typeof 守卫降级，API 路径字符串不会进入产物
          __EDIT_API_BASE__: JSON.stringify(API_PREFIX),
        },
      };
    },
    configureServer(server) {
      const problem = validateEnvironment();
      if (problem !== null) {
        server.config.logger.warn(`[docs-edit] 编辑插件未启用：${problem}`);
        return;
      }
      server.middlewares.use(createEditApiMiddleware());
      server.config.logger.info(
        "[docs-edit] 本地编辑 API 已就绪（/__edit/api/*，仅限本机访问）",
      );
    },
  };
}
