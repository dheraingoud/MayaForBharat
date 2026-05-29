/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apps from "../apps.js";
import type * as autoApprove from "../autoApprove.js";
import type * as autoApproveHandler from "../autoApproveHandler.js";
import type * as autoDream from "../autoDream.js";
import type * as autoDreamHandler from "../autoDreamHandler.js";
import type * as crons from "../crons.js";
import type * as evolutionLog from "../evolutionLog.js";
import type * as evolutionRun from "../evolutionRun.js";
import type * as evolutionRunHandler from "../evolutionRunHandler.js";
import type * as improvements from "../improvements.js";
import type * as queries from "../queries.js";
import type * as seed from "../seed.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apps: typeof apps;
  autoApprove: typeof autoApprove;
  autoApproveHandler: typeof autoApproveHandler;
  autoDream: typeof autoDream;
  autoDreamHandler: typeof autoDreamHandler;
  crons: typeof crons;
  evolutionLog: typeof evolutionLog;
  evolutionRun: typeof evolutionRun;
  evolutionRunHandler: typeof evolutionRunHandler;
  improvements: typeof improvements;
  queries: typeof queries;
  seed: typeof seed;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
