// Internal types scoped to the listicle provider.
// Nothing here leaks to the rest of the pipeline — only ProviderResult exits.

export interface ListicleSearchEntry {
  url: string;
  title: string;
}

export interface ListiclePage {
  url: string;
  html: string;
}
