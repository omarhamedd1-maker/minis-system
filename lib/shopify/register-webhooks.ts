// ==========================================================================
// تسجيل الويب هوكس عند شوبيفاي — عشان الأوردر ييجي في ثواني
// --------------------------------------------------------------------------
// ⚠️⚠️ **ماكانش فيه كود بيعمل ده خالص.** الويب هوك بتاع مينيز و٢ سِك اتسجّل
// **بالإيد** (١٧ أغسطس)، يعني أي بيزنس جديد يربط متجره كان:
//
//   • أوردراته تستنى اللفة الدورية — **ربع ساعة** بدل ثواني
//   • ولو شال التطبيق، إحنا مانعرفش — مفاتيحه تفضل عندنا شغّالة لحد ما
//     تفشل من نفسها من غير سبب واضح
//
// والاتنين دول مايبانوش كأعطال. البيزنس يشتغل، بس بطيء ومش دقيق، ومحدش
// يعرف ليه.
//
// **الموضوعين بس**:
//   `ORDERS_CREATE`    → الأوردر الجديد فورًا
//   `APP_UNINSTALLED`  → نعرف إن المتجر فصل
//
// **والتسجيل بيتعاد من غير ضرر**: بنقرا الموجود الأول ومابنعملش اللي
// موجود. شوبيفاي بترفض التكرار بنفس المسار أصلًا، بس الرفض ده بيرجع كخطأ
// وبيبان كأن حاجة بايظة.
// ==========================================================================

import { shopifyGraphQL } from "./client";

export const WANTED_TOPICS = ["ORDERS_CREATE", "APP_UNINSTALLED"] as const;
export type WantedTopic = (typeof WANTED_TOPICS)[number];

export type ExistingHook = { topic: string; callbackUrl: string | null };

export type RegisterPlan = {
  /** هيتسجّلوا دلوقتي */
  toCreate: WantedTopic[];
  /** موجودين على نفس المسار — مابنلمسهمش */
  alreadyOk: WantedTopic[];
  /**
   * موجودين **بس على مسار تاني**.
   *
   * ⚠️ **مابنمسحهمش ومابنعملش غيرهم.** ده غالبًا بيبقى الدالة القديمة في
   * سوبابيز أو تطبيق تاني على نفس المتجر، ومسحه من ورا الشاشة ممكن يوقّف
   * حاجة شغّالة عند حد تاني.
   */
  elsewhere: { topic: WantedTopic; callbackUrl: string | null }[];
};

/** المسار بيتقارن من غير سلاش آخره ولا فرق حروف */
function sameUrl(a: string | null, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\/+$/, "").toLowerCase();
  return a !== null && norm(a) === norm(b);
}

export function planWebhooks(
  existing: ExistingHook[],
  callbackUrl: string
): RegisterPlan {
  const plan: RegisterPlan = { toCreate: [], alreadyOk: [], elsewhere: [] };

  for (const topic of WANTED_TOPICS) {
    const mine = existing.filter((e) => e.topic === topic);
    if (mine.length === 0) {
      plan.toCreate.push(topic);
      continue;
    }
    const onOurUrl = mine.find((e) => sameUrl(e.callbackUrl, callbackUrl));
    if (onOurUrl) {
      plan.alreadyOk.push(topic);
    } else {
      // موجود عند حد تاني — بنسجّل بتاعنا كمان، والاتنين بيشتغلوا
      plan.toCreate.push(topic);
      for (const e of mine) {
        plan.elsewhere.push({ topic, callbackUrl: e.callbackUrl });
      }
    }
  }

  return plan;
}

const LIST_QUERY = `{
  webhookSubscriptions(first: 100) {
    nodes {
      topic
      endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
    }
  }
}`;

const CREATE_MUTATION = `mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
  webhookSubscriptionCreate(
    topic: $topic
    webhookSubscription: { callbackUrl: $url, format: JSON }
  ) {
    userErrors { field message }
    webhookSubscription { id }
  }
}`;

export type RegisterResult = {
  created: WantedTopic[];
  alreadyOk: WantedTopic[];
  elsewhere: RegisterPlan["elsewhere"];
  /** الموضوع اللي فشل والسبب — **مش استثناء**، الربط نفسه نجح */
  failed: { topic: WantedTopic; error: string }[];
};

/**
 * بيسجّل الويب هوكس الناقصة عند شوبيفاي.
 *
 * ⚠️ **الفشل هنا مش فشل في الربط.** لو شوبيفاي رفضت التسجيل، البيزنس
 * بيفضل شغّال باللفة الدورية كل ربع ساعة — الفرق إن الأوردر بيتأخر مش
 * إنه بيضيع. عشان كده الدالة دي **مابترميش**، بترجّع اللي حصل.
 */
export async function registerShopifyWebhooks(opts: {
  shop: string;
  token: string;
  callbackUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<RegisterResult> {
  const { shop, token, callbackUrl, fetchImpl } = opts;

  let existing: ExistingHook[] = [];
  try {
    const data: {
      webhookSubscriptions?: {
        nodes?: { topic?: string; endpoint?: { callbackUrl?: string } }[];
      };
    } = await shopifyGraphQL(shop, token, LIST_QUERY, {}, fetchImpl);
    existing = (data.webhookSubscriptions?.nodes ?? []).map((n) => ({
      topic: String(n.topic ?? ""),
      callbackUrl: n.endpoint?.callbackUrl ?? null,
    }));
  } catch (e) {
    return {
      created: [],
      alreadyOk: [],
      elsewhere: [],
      failed: WANTED_TOPICS.map((topic) => ({
        topic,
        error: e instanceof Error ? e.message : "معرفناش نقرا الويب هوكس",
      })),
    };
  }

  const plan = planWebhooks(existing, callbackUrl);
  const created: WantedTopic[] = [];
  const failed: RegisterResult["failed"] = [];

  for (const topic of plan.toCreate) {
    try {
      const data: {
        webhookSubscriptionCreate?: {
          userErrors?: { message?: string }[];
        };
      } = await shopifyGraphQL(
        shop,
        token,
        CREATE_MUTATION,
        { topic, url: callbackUrl },
        fetchImpl
      );
      const errs = data.webhookSubscriptionCreate?.userErrors ?? [];
      if (errs.length > 0) {
        failed.push({
          topic,
          error: errs.map((x) => x.message ?? "").join(" · ") || "شوبيفاي رفضت",
        });
      } else {
        created.push(topic);
      }
    } catch (e) {
      failed.push({
        topic,
        error: e instanceof Error ? e.message : "التسجيل وقع",
      });
    }
  }

  return { created, alreadyOk: plan.alreadyOk, elsewhere: plan.elsewhere, failed };
}
