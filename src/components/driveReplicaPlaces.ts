import { liveReplicas, type DriveDevice, type DriveFileReplica } from '../api/drive';

export type ReplicaKindKey = 'fileCopyHome' | 'fileCopyPc' | 'fileCopyPhone' | 'fileCopyCloud';

export interface ReplicaPlace {
  nodeId: string;
  name: string;
  kind: string;
  kindKey: ReplicaKindKey | null;
  keeper: boolean;
  verified: boolean;
  verifiedAt: string | null;
}

export function replicaPlaces(
  replicas: DriveFileReplica[] | null | undefined,
  devices: DriveDevice[] | null | undefined,
): ReplicaPlace[] {
  const live = liveReplicas(replicas);
  const keeperIds = new Set(
    (devices ?? []).filter((d) => d.keeper).map((d) => d.id),
  );

  return live.map((r) => {
    let kindKey: ReplicaKindKey | null = null;
    if (r.kind === 'home') kindKey = 'fileCopyHome';
    else if (r.kind === 'pc') kindKey = 'fileCopyPc';
    else if (r.kind === 'phone') kindKey = 'fileCopyPhone';
    else if (r.kind === 'cloud') kindKey = 'fileCopyCloud';

    return {
      nodeId: r.nodeId,
      name: r.name,
      kind: r.kind,
      kindKey,
      keeper: keeperIds.has(r.nodeId),
      verified: r.state === 'verified' && Boolean(r.verifiedAt),
      verifiedAt: r.verifiedAt ?? null,
    };
  });
}
