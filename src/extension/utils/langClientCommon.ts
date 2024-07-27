import type * as client from "vscode-languageclient";
import { assertNotNull } from "../../library/exception";

export class BaseLangClientProvider {
  protected getNonNullClient() {
    const cl = this.getClient();
    assertNotNull(cl, "Language server not running");
    return cl;
  }

  constructor(
    protected readonly getClient: () => client.LanguageClient | undefined,
  ) {}
}
