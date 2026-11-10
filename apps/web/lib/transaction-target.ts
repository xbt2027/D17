import { ethers } from "ethers";
import type { PublicDeployment } from "./d17Manifest";

const FACTORY_ABI = [
  "function weth() view returns (address)",
  "function lockerFactory() view returns (address)",
  "function lockerFactoryPinned() view returns (bool)",
  "function isLocker(address) view returns (bool)",
  "function launches(address) view returns (bool canonical,address creator,address token,address liquidityVault,bytes32 rulesHash)",
];
const LOCKER_ABI = [
  "function owner() view returns (address)",
  "function factory() view returns (address)",
  "function weth() view returns (address)",
];
const same = (a: string, b: string) => ethers.getAddress(a) === ethers.getAddress(b);
function requireTarget(ok: boolean) {
  if (!ok) throw new Error("Transaction blocked: target is not part of the published D17 deployment or is not your vault.");
}

/** Only the bundled deployment is a trust root; URL, API and launch-supplied
 * addresses remain untrusted. Read through the signing wallet, never the UI RPC. */
export async function assertTransactionTarget(
  name: string, address: string, signer: ethers.Signer, deployment: PublicDeployment,
) {
  const provider = signer.provider;
  requireTarget(Boolean(provider) && deployment.status === "deployed");
  if (!provider) throw new Error("Wallet provider unavailable");
  requireTarget((await provider.getNetwork()).chainId === BigInt(deployment.chainId));
  const target = ethers.getAddress(address);
  const factoryAddress = ethers.getAddress(deployment.contracts.d17Factory);
  requireTarget(factoryAddress !== ethers.ZeroAddress && (await provider.getCode(factoryAddress)) !== "0x");
  requireTarget((await provider.getCode(target)) !== "0x");
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  requireTarget(same(await factory.weth(), deployment.weth));
  if (name === "D17Locker") {
    // Check the canonical registry before asking an untrusted address anything.
    requireTarget(await factory.isLocker(target));
    const locker = new ethers.Contract(target, LOCKER_ABI, provider);
    const [owner, root, weth] = await Promise.all([locker.owner(), locker.factory(), locker.weth()]);
    requireTarget(same(owner, await signer.getAddress()) && same(root, factoryAddress) && same(weth, deployment.weth));
  } else if (name === "D17LockerFactory") {
    requireTarget(same(target, deployment.contracts.lockerFactory));
    requireTarget(await factory.lockerFactoryPinned());
    requireTarget(same(await factory.lockerFactory(), target));
  } else if (name === "D17Launch") {
    requireTarget((await factory.launches(target)).canonical);
  } else if (name === "D17LiquidityVault") {
    const vault = new ethers.Contract(target, ["function launch() view returns (address)"], provider);
    const record = await factory.launches(await vault.launch());
    requireTarget(record.canonical && same(record.liquidityVault, target));
  } else if (name === "WETH") {
    requireTarget(same(target, deployment.weth));
  } else {
    throw new Error(`No transaction target policy for ${name}`);
  }
}

function wrapSend(signer: ethers.Signer, send: (tx: ethers.TransactionRequest) => Promise<ethers.TransactionResponse>) {
  return new Proxy(signer, {
    get(target, key) {
      if (key === "sendTransaction") return send;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Repeat authentication at the send boundary, including the second step of
 * a withdrawal. Read-only verifyLaunch also authenticates its caller contract. */
export async function authenticatedContract(
  name: string, address: string, abi: ethers.InterfaceAbi, signer: ethers.Signer, deployment: PublicDeployment,
) {
  await assertTransactionTarget(name, address, signer, deployment);
  const guarded = wrapSend(signer, async (tx) => {
    requireTarget(typeof tx.to === "string" && same(tx.to, address));
    await assertTransactionTarget(name, address, signer, deployment);
    return signer.sendTransaction(tx);
  });
  return new ethers.Contract(ethers.getAddress(address), abi, guarded);
}

/** A late wallet/account/selection change invalidates an in-flight preflight.
 * Raw EIP-1193 reads avoid a cached UI account or provider network. */
export function guardWalletSession(
  signer: ethers.Signer, wallet: ethers.Eip1193Provider, chainId: number, stillCurrent: () => boolean,
) {
  return wrapSend(signer, async (tx) => {
    if (!stillCurrent()) throw new Error("Selection changed. Review the transaction and try again.");
    const [chain, accounts] = await Promise.all([
      wallet.request({ method: "eth_chainId" }), wallet.request({ method: "eth_accounts" }),
    ]);
    if (BigInt(chain) !== BigInt(chainId)) throw new Error("Wallet network changed. Review the transaction and try again.");
    const owner = await signer.getAddress();
    if (!Array.isArray(accounts) || !accounts[0] || !same(accounts[0], owner)) {
      throw new Error("Wallet account changed. Review the transaction and try again.");
    }
    if (!stillCurrent()) throw new Error("Selection changed. Review the transaction and try again.");
    return signer.sendTransaction({ ...tx, chainId });
  });
}
