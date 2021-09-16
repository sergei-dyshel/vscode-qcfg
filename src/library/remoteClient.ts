import * as jayson from 'jayson/promise';
/* TODO: use import type with TS 3.8 */
import type {
  RemoteProtocol,
  IdentifyResult,
} from '../extension/modules/remoteServer';
import type { FirstParameter } from './templateTypes';
import { Logger, log } from './logging';
import * as nodejs from './nodejs';
import { filterNonNull } from './tsUtils';

const START_PORT = 7890;

export const PORT_RANGE = [...Array(9).keys()].map((i) => i + START_PORT);

type MethodName = Extract<keyof RemoteProtocol, string>;

export class RemoteClient {
  private readonly _client: jayson.Client;
  protected log: Logger;

  constructor(protected tcpPort: number) {
    this.log = new Logger({ instance: 'port=' + tcpPort.toString() });
    this._client = jayson.Client.tcp({
      port: tcpPort,
    });
  }

  get port() {
    return this.tcpPort;
  }

  send<K extends MethodName>(
    k: K,
    arg: FirstParameter<RemoteProtocol[K]>,
  ): ReturnType<RemoteProtocol[K]> {
    this.log.debug(`Sending request "${k}" with arguments`, arg);
    return (
      this._client
        .request(k, arg)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((res: any) => {
          if ('error' in res) {
            this.log.debug('Received error', res.error);
            throw new Error(res.error as string);
          }
          if ('result' in res) {
            this.log.debug('Received result', res.result);
            return res.result;
          }
          return;
        }) as ReturnType<RemoteProtocol[K]>
    );
  }

  async sendNoResult<K extends MethodName>(
    k: K,
    arg: FirstParameter<RemoteProtocol[K]>,
  ): Promise<unknown> {
    return this.send(k, arg);
  }
}

export class IdentifiedClient extends RemoteClient {
  info!: IdentifyResult;

  private constructor(tcpPort: number) {
    super(tcpPort);
  }

  override toString() {
    return `RemoteClient(port=${this.port})`;
  }

  [nodejs.util.inspect.custom](
    _depth: unknown,
    options: NodeJS.InspectOptions,
  ) {
    return nodejs.util.inspect({ port: this.tcpPort, ...this.info }, options);
  }

  static async connect(tcpPort: number): Promise<IdentifiedClient> {
    const client = new IdentifiedClient(tcpPort);
    client.info = await client.send('identify', {});
    if (client.info.workspaceName)
      client.log.instance = client.info.workspaceName;
    return client;
  }
}

/**
 * Collection of clients for currently alive servers
 */
export class MultiClient {
  private constructor(public clients: IdentifiedClient[]) {
    log.info(
      'Connected clients: ',
      nodejs.util.inspect(clients, { breakLength: 1024 }),
    );
  }

  /**
   * Find client which has `folder` as one of its workspace folders
   */
  findByFolder(folder: string): IdentifiedClient | undefined {
    const absFolder = nodejs.path.resolve(process.cwd(), folder);
    for (const client of this.clients)
      for (const wsFolder of client.info.workspaceFolders ?? [])
        if (wsFolder === absFolder) return client;
    return;
  }

  /**
   * Get default client
   */
  getDefault(): IdentifiedClient | undefined {
    const client = this.clients.max(
      (x, y) => x.info.setDefaultTimestamp - y.info.setDefaultTimestamp,
    );
    if (!client) return undefined;
    if (client.info.setDefaultTimestamp === 0) return undefined;
    return client;
  }

  /**
   * Try connecting to all ports and return set of working clients
   */
  static async connect(): Promise<MultiClient> {
    const requests = PORT_RANGE.map(async (port) => {
      try {
        return await IdentifiedClient.connect(port);
      } catch (_: unknown) {
        return undefined;
      }
    });

    const resolved = await Promise.all(requests);
    return new MultiClient(filterNonNull(resolved));
  }

  /**
   * Send request to all clients (ignores result)
   */
  async sendNoResult<K extends MethodName>(
    k: K,
    arg: FirstParameter<RemoteProtocol[K]>,
  ): Promise<void> {
    return Promise.all(
      this.clients.map(async (client) => client.sendNoResult(k, arg)),
    ).ignoreResult();
  }
}
