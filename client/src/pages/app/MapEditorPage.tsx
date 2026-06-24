import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Check, MapPin, Building2, Layers, ImageIcon, PenTool, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { usePropertyStore } from '@/store/propertyStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/modals/Modal';
import { useI18n } from '@/i18n/useI18n';
import { useRoomStatusLabels } from '@/i18n/roomStatus';
import { ROOM_STATUS_ORDER } from '@/constants/roomStatus';
import { MapEditorCanvas } from '@/features/map-editor/MapEditorCanvas';
import type {
  EditorStep,
  EditorTool,
  FloorPlanData,
  RoomDraft,
} from '@/features/map-editor/types';
import { getApiErrorMessage, normalizeRoomType } from '@/features/map-editor/apiError';
import { readImageFileDimensions } from '@/features/map-editor/svgUtils';
import styles from './MapEditorPage.module.css';

type FeedbackType = 'success' | 'error' | 'info';
type Feedback = { type: FeedbackType; text: string } | null;

const DEFAULT_ROOM: RoomDraft = {
  roomNumber: '',
  name: '',
  area: '20',
  roomType: 'office',
  status: 'free',
  existingRoomId: null,
};

export function MapEditorPage() {
  const { t } = useI18n();
  const statusLabels = useRoomStatusLabels();
  const qc = useQueryClient();

  const STEP_META = useMemo(
    (): { id: EditorStep; label: string; icon: typeof MapPin }[] => [
      { id: 'location', label: t('common.objectAndFloor'), icon: MapPin },
      { id: 'plan', label: t('common.planUnderlay'), icon: ImageIcon },
      { id: 'draw', label: t('common.roomContours'), icon: PenTool },
    ],
    [t]
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const finishPolygonRef = useRef<() => void>(() => {});
  const {
    propertyId,
    buildingId,
    floorId,
    setPropertyId,
    setBuildingId,
    setFloorId,
  } = usePropertyStore();

  const [step, setStep] = useState<EditorStep>('location');
  const [tool, setTool] = useState<EditorTool>('polygon');
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [rectStart, setRectStart] = useState<[number, number] | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [roomDraft, setRoomDraft] = useState<RoomDraft>(DEFAULT_ROOM);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [editBuildingName, setEditBuildingName] = useState('');
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorLevel, setNewFloorLevel] = useState('1');
  const [editFloorName, setEditFloorName] = useState('');
  const [editFloorLevel, setEditFloorLevel] = useState('1');
  const [buildingModal, setBuildingModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [floorModal, setFloorModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [pendingPlanFile, setPendingPlanFile] = useState<File | null>(null);
  const [editingContour, setEditingContour] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api.get('/properties').then((r) => r.data.data),
  });

  const pid = propertyId || properties?.[0]?.id;

  const { data: buildings } = useQuery({
    queryKey: ['buildings', pid],
    queryFn: () => api.get(`/properties/${pid}/buildings`).then((r) => r.data.data),
    enabled: !!pid,
  });

  const bid = buildingId || buildings?.[0]?.id;

  const { data: floors } = useQuery({
    queryKey: ['floors', bid],
    queryFn: () => api.get(`/buildings/${bid}/floors`).then((r) => r.data.data),
    enabled: !!bid,
  });

  const fid = floors?.some((f: { id: number }) => f.id === floorId) ? floorId : floors?.[0]?.id;

  const { data: planData, refetch: refetchPlan, isLoading: planLoading } = useQuery({
    queryKey: ['floorPlan', fid],
    queryFn: () => api.get(`/floors/${fid}/plan`).then((r) => r.data.data as FloorPlanData),
    enabled: !!fid,
  });

  const plan = planData?.plan;
  const planW = plan?.width || 1200;
  const planH = plan?.height || 800;
  const mapRooms = planData?.rooms || [];
  const floorRooms = planData?.floorRooms || [];

  useEffect(() => {
    if (properties?.[0] && !propertyId) setPropertyId(properties[0].id);
  }, [properties, propertyId, setPropertyId]);

  useEffect(() => {
    if (buildings?.[0] && !buildingId) setBuildingId(buildings[0].id);
  }, [buildings, buildingId, setBuildingId]);

  useEffect(() => {
    if (!floors?.length) return;
    const valid = floors.some((f: { id: number }) => f.id === floorId);
    if (!valid) setFloorId(floors[0].id);
  }, [floors, floorId, setFloorId]);

  const showFeedback = useCallback((type: FeedbackType, text: string) => {
    setFeedback({ type, text });
    if (type === 'success') {
      window.setTimeout(() => setFeedback(null), 4000);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraftPoints([]);
        setRectStart(null);
        setEditingContour(false);
        return;
      }
      if (
        step === 'draw' &&
        e.key === 'Enter' &&
        draftPoints.length >= 3 &&
        (tool === 'polygon' || editingContour)
      ) {
        e.preventDefault();
        finishPolygonRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, draftPoints.length, tool, editingContour]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['floorPlan', fid] });

  const createFloor = useMutation({
    mutationFn: async (payload: { name: string; levelNumber: number }) => {
      const res = await api.post('/floors', {
        buildingId: bid,
        name: payload.name,
        levelNumber: payload.levelNumber,
      });
      return res.data.data.id as number;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['floors', bid] });
      setFloorId(id);
      setNewFloorName('');
      setNewFloorLevel('1');
      setFloorModal(null);
      showFeedback('success', t('mapEditor.floorCreated'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const updateFloor = useMutation({
    mutationFn: async (payload: { name: string; levelNumber: number }) => {
      if (!fid) throw new Error(t('common.stepFloor'));
      await api.put(`/floors/${fid}`, {
        name: payload.name,
        levelNumber: payload.levelNumber,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floors', bid] });
      setFloorModal(null);
      showFeedback('success', t('mapEditor.floorRenamed'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const createBuilding = useMutation({
    mutationFn: async () => {
      if (!pid) throw new Error(t('common.selectObjectBuildingFloor'));
      const name = newBuildingName.trim();
      if (!name) throw new Error(t('mapEditor.enterBuildingName'));
      const res = await api.post('/buildings', {
        propertyId: pid,
        name,
      });
      return res.data.data.id as number;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['buildings', pid] });
      setBuildingId(id);
      setFloorId(null);
      setNewBuildingName('');
      setBuildingModal(null);
      showFeedback('success', t('mapEditor.buildingCreated'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const updateBuilding = useMutation({
    mutationFn: async (name: string) => {
      if (!bid) throw new Error(t('common.stepBuilding'));
      await api.put(`/buildings/${bid}`, { name });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buildings', pid] });
      setBuildingModal(null);
      showFeedback('success', t('mapEditor.buildingRenamed'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const removeBuilding = useMutation({
    mutationFn: async () => {
      if (!bid) throw new Error(t('common.stepBuilding'));
      await api.delete(`/buildings/${bid}`);
    },
    onSuccess: () => {
      setBuildingId(null);
      setFloorId(null);
      qc.invalidateQueries({ queryKey: ['buildings', pid] });
      qc.invalidateQueries({ queryKey: ['floors'] });
      qc.invalidateQueries({ queryKey: ['floorPlan'] });
      setBuildingModal(null);
      showFeedback('success', t('mapEditor.buildingDeleted'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const removeFloor = useMutation({
    mutationFn: async () => {
      if (!fid) throw new Error(t('common.stepFloor'));
      await api.delete(`/floors/${fid}`);
    },
    onSuccess: () => {
      setFloorId(null);
      setSelectedRoomId(null);
      setSelectedShapeId(null);
      qc.invalidateQueries({ queryKey: ['floors', bid] });
      qc.invalidateQueries({ queryKey: ['floorPlan'] });
      setFloorModal(null);
      showFeedback('success', t('mapEditor.floorDeleted'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const uploadPlan = useMutation({
    mutationFn: async (file: File) => {
      if (!fid) throw new Error(t('common.stepFloor'));
      const dim = await readImageFileDimensions(file);
      const fd = new FormData();
      fd.append('image', file);
      fd.append('width', String(dim.width));
      fd.append('height', String(dim.height));
      const res = await api.post(`/floors/${fid}/plan`, fd);
      return res.data.data as FloorPlanData['plan'];
    },
    onSuccess: (savedPlan) => {
      qc.setQueryData(['floorPlan', fid], (prev: FloorPlanData | undefined) => ({
        plan: savedPlan,
        shapes: prev?.shapes ?? [],
        rooms: prev?.rooms ?? [],
        floorRooms: prev?.floorRooms ?? [],
      }));
      void refetchPlan();
      setUploadPreview(null);
      setPendingPlanFile(null);
      showFeedback('success', t('mapEditor.planSaved'));
      setStep('draw');
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const resolveRoomId = useCallback((): number | null => {
    if (roomDraft.existingRoomId) return roomDraft.existingRoomId;
    const num = roomDraft.roomNumber.trim();
    if (!num) return null;
    const match = floorRooms.find((r) => r.roomNumber === num);
    return match?.id ?? null;
  }, [roomDraft.existingRoomId, roomDraft.roomNumber, floorRooms]);

  const syncRoomMeta = useCallback(
    async (roomId: number) => {
      await api.put(`/rooms/${roomId}`, {
        name: roomDraft.name.trim() || roomDraft.roomNumber.trim(),
        area: Number(roomDraft.area) || 0,
        roomType: normalizeRoomType(roomDraft.roomType),
        status: roomDraft.status,
      });
    },
    [roomDraft]
  );

  const saveShape = useMutation({
    mutationFn: async (points: [number, number][]) => {
      if (!plan?.id) throw new Error(t('common.uploadPlanFirst'));
      if (!pid || !bid || !fid) throw new Error(t('common.selectObjectBuildingFloor'));
      const pointsJson = { type: 'polygon', points };

      let roomId = resolveRoomId();
      if (!roomId) {
        if (!roomDraft.roomNumber.trim()) throw new Error(t('common.enterRoomNumber'));
        const duplicate = floorRooms.some((r) => r.roomNumber === roomDraft.roomNumber.trim());
        if (duplicate) throw new Error(t('mapEditor.roomExistsUseList'));
        const roomRes = await api.post('/rooms', {
          propertyId: pid,
          buildingId: bid,
          floorId: fid,
          roomNumber: roomDraft.roomNumber.trim(),
          name: roomDraft.name.trim() || roomDraft.roomNumber.trim(),
          area: Number(roomDraft.area) || 0,
          roomType: normalizeRoomType(roomDraft.roomType),
          status: roomDraft.status,
        });
        roomId = roomRes.data.data.id;
      } else {
        await syncRoomMeta(roomId);
      }

      await api.post('/room-shapes', {
        roomId,
        floorPlanId: plan.id,
        shapeType: 'polygon',
        pointsJson,
      });
      return roomId;
    },
    onSuccess: (roomId) => {
      invalidate();
      setDraftPoints([]);
      setRectStart(null);
      setEditingContour(false);
      if (roomId) {
        setSelectedRoomId(roomId);
        setRoomDraft((d) => ({ ...d, existingRoomId: roomId }));
      } else {
        setRoomDraft(DEFAULT_ROOM);
      }
      setTool('polygon');
      showFeedback('success', t('mapEditor.contourSaved'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const updateShape = useMutation({
    mutationFn: async (points: [number, number][]) => {
      if (!selectedShapeId) throw new Error(t('mapEditor.saveFailed'));
      await api.put(`/room-shapes/${selectedShapeId}`, {
        pointsJson: { type: 'polygon', points },
      });
      const roomId = selectedRoomId ?? mapRooms.find((r) => r.shape.id === selectedShapeId)?.id;
      if (roomId) await syncRoomMeta(roomId);
    },
    onSuccess: () => {
      invalidate();
      setDraftPoints([]);
      setRectStart(null);
      setEditingContour(false);
      showFeedback('success', t('mapEditor.contourUpdated'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const deleteShape = useMutation({
    mutationFn: (shapeId: number) => api.delete(`/room-shapes/${shapeId}`),
    onSuccess: () => {
      invalidate();
      setSelectedShapeId(null);
      setSelectedRoomId(null);
      setEditingContour(false);
      showFeedback('success', t('mapEditor.contourDeleted'));
    },
    onError: (err) => {
      showFeedback('error', getApiErrorMessage(err, t('mapEditor.saveFailed')));
    },
  });

  const canGoPlan = Boolean(pid && bid && fid);
  const canGoDraw = Boolean(plan?.imageUrl);
  const selectedBuilding = buildings?.find((b: { id: number; name: string }) => b.id === bid) || null;
  const selectedFloor = floors?.find((f: { id: number; name: string; level_number: number }) => f.id === fid) || null;

  const goStep = (s: EditorStep) => {
    if (s === 'plan' && !canGoPlan) return;
    if (s === 'draw' && !canGoDraw) return;
    setStep(s);
  };

  const handleFile = (file: File) => {
    setUploadPreview(URL.createObjectURL(file));
    setPendingPlanFile(file);
  };

  const handleSavePlan = () => {
    if (!pendingPlanFile) {
      showFeedback('error', t('common.uploadPlanPrevStep'));
      return;
    }
    uploadPlan.mutate(pendingPlanFile);
  };

  const canSaveContour =
    Boolean(plan?.id) &&
    (roomDraft.existingRoomId ||
      roomDraft.roomNumber.trim() ||
      resolveRoomId());

  const applyContour = useCallback(
    (points: [number, number][]) => {
      if (points.length < 3) {
        showFeedback('error', t('mapEditor.needMinPoints'));
        return;
      }
      if (!canSaveContour) {
        showFeedback('error', t('mapEditor.selectFromList'));
        return;
      }
      if (editingContour && selectedShapeId) {
        updateShape.mutate(points);
      } else {
        saveShape.mutate(points);
      }
    },
    [
      canSaveContour,
      editingContour,
      selectedShapeId,
      saveShape,
      updateShape,
      showFeedback,
      t,
    ]
  );

  const finishPolygon = useCallback(() => {
    applyContour(draftPoints);
  }, [applyContour, draftPoints]);

  finishPolygonRef.current = finishPolygon;

  const onPolygonComplete = (pts: [number, number][]) => {
    setDraftPoints(pts);
    applyContour(pts);
  };

  const pickFloorRoom = (r: (typeof floorRooms)[0]) => {
    setSelectedRoomId(r.id);
    setEditingContour(false);
    const shaped = mapRooms.find((m) => m.id === r.id);
    if (shaped) {
      setSelectedShapeId(shaped.shape.id);
      setRoomDraft({
        roomNumber: r.roomNumber,
        name: r.name || '',
        area: String(r.area),
        roomType: r.roomType,
        status: r.status,
        existingRoomId: r.id,
      });
      setTool('select');
    } else {
      setSelectedShapeId(null);
      setRoomDraft({
        roomNumber: r.roomNumber,
        name: r.name || '',
        area: String(r.area),
        roomType: r.roomType,
        status: r.status,
        existingRoomId: r.id,
      });
      setDraftPoints([]);
      setTool('polygon');
      showFeedback('info', t('mapEditor.tip3'));
    }
  };

  const startNewContour = () => {
    setSelectedShapeId(null);
    setSelectedRoomId(null);
    setEditingContour(false);
    setRoomDraft(DEFAULT_ROOM);
    setDraftPoints([]);
    setRectStart(null);
    setTool('polygon');
    setFeedback(null);
  };

  const editSelectedContour = () => {
    const room = mapRooms.find((r) => r.shape.id === selectedShapeId);
    if (!room) return;
    setDraftPoints([...room.shape.pointsJson.points]);
    setEditingContour(true);
    setTool('polygon');
    showFeedback('info', t('mapEditor.tip4'));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('mapEditor.title')}</h1>
        <p className={styles.subtitle}>
          {t('mapEditor.lead')} {t('mapEditor.savedOnMap')}
        </p>
      </header>

      <nav className={styles.steps} aria-label={t('common.steps')}>
        {STEP_META.map((s, i) => {
          const Icon = s.icon;
          const done =
            (s.id === 'location' && canGoPlan) ||
            (s.id === 'plan' && canGoDraw) ||
            (s.id === 'draw' && mapRooms.length > 0);
          const active = step === s.id;
          const disabled =
            (s.id === 'plan' && !canGoPlan) ||
            (s.id === 'draw' && !canGoDraw);
          return (
            <button
              key={s.id}
              type="button"
              className={`${styles.step} ${active ? styles.stepActive : ''} ${done && !active ? styles.stepDone : ''}`}
              disabled={disabled}
              onClick={() => goStep(s.id)}
            >
              <span className={styles.stepNum}>{done && !active ? <Check size={14} /> : i + 1}</span>
              <Icon size={16} />
              {s.label}
            </button>
          );
        })}
      </nav>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          {step === 'location' && (
            <>
              <section className={styles.panelSection}>
                <h3>
                  <MapPin size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t('common.stepObject')}
                </h3>
                <div className={styles.field}>
                  <Select
                    label={t('common.tradeObject')}
                    fullWidth
                    value={String(pid ?? '')}
                    onChange={(v) => {
                      setPropertyId(Number(v));
                      setBuildingId(null);
                      setFloorId(null);
                    }}
                    options={
                      properties?.map((p: { id: number; name: string }) => ({
                        value: String(p.id),
                        label: p.name,
                      })) ?? []
                    }
                  />
                </div>
              </section>

              <section className={styles.panelSection}>
                <h3>
                  <Building2 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t('common.stepBuilding')}
                </h3>
                <div className={styles.field}>
                  <Select
                    label={t('common.building')}
                    fullWidth
                    value={String(bid ?? '')}
                    onChange={(v) => {
                      setBuildingId(Number(v));
                      setFloorId(null);
                    }}
                    options={
                      buildings?.map((b: { id: number; name: string }) => ({
                        value: String(b.id),
                        label: b.name,
                      })) ?? []
                    }
                  />
                </div>
                <div className={styles.inlineActions}>
                  <Button
                    variant="secondary"
                    onClick={() => setBuildingModal('create')}
                    disabled={!pid}
                    title={t('mapEditor.addBuilding')}
                  >
                    +
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!selectedBuilding) return;
                      setEditBuildingName(selectedBuilding.name || '');
                      setBuildingModal('edit');
                    }}
                    disabled={!bid}
                    title={t('mapEditor.renameBuilding')}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setBuildingModal('delete')}
                    disabled={!bid}
                    title={t('mapEditor.deleteBuilding')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </section>

              <section className={styles.panelSection}>
                <h3>
                  <Layers size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {t('common.stepFloor')}
                </h3>
                <div className={styles.field}>
                  <Select
                    label={t('common.floor')}
                    fullWidth
                    value={String(fid ?? '')}
                    onChange={(v) => setFloorId(Number(v))}
                    options={
                      floors?.map((f: { id: number; name: string }) => ({
                        value: String(f.id),
                        label: f.name,
                      })) ?? []
                    }
                  />
                </div>
                <div className={styles.newFloorRow}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setNewFloorName('');
                      setNewFloorLevel('1');
                      setFloorModal('create');
                    }}
                    disabled={!bid}
                  >
                    +
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!selectedFloor) return;
                      setEditFloorName(selectedFloor.name || '');
                      setEditFloorLevel(String(selectedFloor.level_number || 1));
                      setFloorModal('edit');
                    }}
                    disabled={!fid}
                    title={t('mapEditor.renameFloor')}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setFloorModal('delete')}
                    disabled={!fid}
                    title={t('mapEditor.deleteFloor')}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                {canGoPlan && (
                  <Button onClick={() => setStep('plan')} style={{ width: '100%', marginTop: 8 }}>
                    {t('common.nextUploadPlan')}
                  </Button>
                )}
              </section>
            </>
          )}

          {step === 'plan' && (
            <section className={styles.panelSection}>
              <h3>
                <ImageIcon size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                {t('common.planUnderlay')}
              </h3>
              <p className={styles.planMeta}>
                {t('mapEditor.uploadHint')}
              </p>
              <label className={styles.uploadZone}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                  }}
                />
                <div className={styles.uploadIcon}>
                  <Upload size={32} />
                </div>
                <div>{t('common.uploadClickOrDrop')}</div>
                <div className={styles.planMeta}>{t('common.uploadScanHint')}</div>
              </label>
              {uploadPreview && (
                <>
                  <p className={styles.planMeta}>{t('common.preview')}</p>
                  <img className={styles.previewThumb} src={uploadPreview} alt={t('common.floorPlan')} />
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                      {t('common.replaceImage')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleSavePlan}
                      disabled={uploadPlan.isPending || !pendingPlanFile}
                    >
                      {uploadPlan.isPending ? t('common.saving') : t('common.save')}
                    </Button>
                  </div>
                </>
              )}
              {feedback && (
                <div
                  className={
                    feedback.type === 'error'
                      ? styles.alert
                      : feedback.type === 'success'
                        ? `${styles.feedback} ${styles.feedbackSuccess}`
                        : styles.planMeta
                  }
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                >
                  {feedback.text}
                </div>
              )}
              {uploadPlan.isPending && <p className={styles.planMeta}>{t('common.loading')}</p>}
              {plan?.imageUrl && (
                <>
                  <p className={styles.planMeta}>
                    {t('common.currentPlan', { w: planW, h: planH })}
                    {plan.original_file_name ? ` · ${plan.original_file_name}` : ''}
                  </p>
                  <img
                    className={styles.previewThumb}
                    src={plan.imageUrl}
                    key={plan.imageUrl}
                    alt={t('common.floorPlan')}
                  />
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                      {t('common.replaceImage')}
                    </Button>
                    <Button onClick={() => setStep('draw')}>{t('common.goToContours')}</Button>
                  </div>
                </>
              )}
            </section>
          )}

          {step === 'draw' && (
            <>
              <section className={`${styles.panelSection} ${styles.tipsBox}`}>
                <h3>{t('mapEditor.tipsTitle')}</h3>
                <ol className={styles.tipsList}>
                  <li>{t('mapEditor.tip1')}</li>
                  <li>{t('mapEditor.tip2')}</li>
                  <li>{t('mapEditor.tip3')}</li>
                  <li>{t('mapEditor.tip4')}</li>
                </ol>
              </section>

              {feedback && (
                <div
                  className={`${styles.feedback} ${
                    feedback.type === 'success'
                      ? styles.feedbackSuccess
                      : feedback.type === 'error'
                        ? styles.feedbackError
                        : styles.feedbackInfo
                  }`}
                  role="status"
                >
                  {feedback.text}
                </div>
              )}

              <section className={styles.panelSection}>
                <h3>{t('common.contourForRoom')}</h3>
                {!plan?.imageUrl && (
                  <div className={styles.alert}>{t('common.uploadPlanStepHint')}</div>
                )}
                <Select
                  label={t('common.mode')}
                  fullWidth
                  value={roomDraft.existingRoomId ? 'existing' : 'new'}
                  onChange={(mode) => {
                    if (mode === 'new') {
                      startNewContour();
                    } else {
                      setRoomDraft((d) => ({ ...d, existingRoomId: selectedRoomId }));
                      showFeedback('info', t('mapEditor.pickExistingHint'));
                    }
                  }}
                  options={[
                    { value: 'new', label: t('common.newRoom') },
                    { value: 'existing', label: t('common.existingContour') },
                  ]}
                />
                {!roomDraft.existingRoomId ? (
                  <>
                    <Input
                      label={t('common.roomNumber')}
                      required
                      value={roomDraft.roomNumber}
                      onChange={(e) => setRoomDraft({ ...roomDraft, roomNumber: e.target.value })}
                    />
                    <Input
                      label={t('common.name')}
                      value={roomDraft.name}
                      onChange={(e) => setRoomDraft({ ...roomDraft, name: e.target.value })}
                    />
                    <Input
                      label={t('common.areaSqm')}
                      required
                      value={roomDraft.area}
                      onChange={(e) => setRoomDraft({ ...roomDraft, area: e.target.value })}
                    />
                    <Select
                      label={t('common.type')}
                      fullWidth
                      value={roomDraft.roomType}
                      onChange={(roomType) => setRoomDraft({ ...roomDraft, roomType })}
                      options={[
                        { value: 'office', label: t('common.roomTypeOffice') },
                        { value: 'retail', label: t('common.roomTypeRetail') },
                        { value: 'warehouse', label: t('common.roomTypeWarehouse') },
                        { value: 'food', label: t('common.roomTypeFood') },
                        { value: 'service', label: t('common.roomTypeService') },
                        { value: 'other', label: t('common.misc') },
                      ]}
                    />
                    <Select
                      label={t('common.status')}
                      fullWidth
                      value={roomDraft.status}
                      onChange={(status) => setRoomDraft({ ...roomDraft, status })}
                      options={ROOM_STATUS_ORDER.map((s) => ({
                        value: s,
                        label: statusLabels[s],
                      }))}
                    />
                  </>
                ) : (
                  <p className={styles.planMeta}>
                    {t('common.selected')}: <strong>{roomDraft.roomNumber}</strong>
                    {selectedShapeId ? ` ${t('common.hasContourRedraw')}` : ` ${t('common.withoutContour')}`}
                  </p>
                )}
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={startNewContour}>
                    {t('common.newContour')}
                  </Button>
                  {draftPoints.length >= 3 && (
                    <Button
                      onClick={finishPolygon}
                      disabled={
                        !canSaveContour || saveShape.isPending || updateShape.isPending
                      }
                      title={
                        !canSaveContour ? t('mapEditor.selectFromList') : undefined
                      }
                    >
                      {saveShape.isPending || updateShape.isPending
                        ? t('mapEditor.saving')
                        : t('common.finishContour', { n: draftPoints.length })}
                    </Button>
                  )}
                  {selectedShapeId && (
                    <>
                      <Button variant="secondary" onClick={editSelectedContour}>
                        {t('common.editPoints')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => deleteShape.mutate(selectedShapeId)}
                        disabled={deleteShape.isPending}
                      >
                        {t('common.deleteContour')}
                      </Button>
                    </>
                  )}
                </div>
              </section>

              <section className={styles.panelSection}>
                <h3>{t('common.floorsOnLevel', { n: floorRooms.length })}</h3>
                <ul className={styles.roomList}>
                  {floorRooms.map((r) => (
                    <li
                      key={r.id}
                      className={`${styles.roomItem} ${selectedRoomId === r.id ? styles.roomItemActive : ''}`}
                      onClick={() => pickFloorRoom(r)}
                    >
                      <span>
                        {r.roomNumber}
                        {r.name ? ` · ${r.name}` : ''}
                      </span>
                      <span className={`${styles.badge} ${r.hasShape ? styles.badgeOk : styles.badgeWarn}`}>
                        {r.hasShape ? t('common.onMap') : t('common.noContour')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </aside>

        <div className={styles.editorArea}>
          {(step === 'draw' || (step === 'plan' && plan?.imageUrl)) && (
            <MapEditorCanvas
              planWidth={planW}
              planHeight={planH}
              imageUrl={plan?.imageUrl ?? null}
              rooms={mapRooms}
              tool={step === 'draw' ? tool : 'pan'}
              draftPoints={draftPoints}
              rectStart={rectStart}
              selectedShapeId={selectedShapeId}
              selectedRoomId={selectedRoomId}
              onToolChange={setTool}
              onDraftPointsChange={setDraftPoints}
              onRectStartChange={setRectStart}
              onSelectShape={(shapeId, roomId) => {
                setSelectedShapeId(shapeId);
                setSelectedRoomId(roomId);
                const fr = floorRooms.find((x) => x.id === roomId);
                const mr = mapRooms.find((x) => x.id === roomId);
                if (fr) {
                  setRoomDraft({
                    roomNumber: fr.roomNumber,
                    name: fr.name || '',
                    area: String(fr.area),
                    roomType: fr.roomType,
                    status: fr.status,
                    existingRoomId: fr.id,
                  });
                }
                if (mr) setSelectedShapeId(mr.shape.id);
              }}
              onPolygonComplete={onPolygonComplete}
              onRectComplete={(pts) => {
                setDraftPoints(pts);
                applyContour(pts);
              }}
              disabled={step !== 'draw' || planLoading}
            />
          )}
          {step === 'location' && (
            <div className={styles.alert} style={{ margin: 24 }}>
              {t('common.selectObjectBuildingFloor')}
            </div>
          )}
          {step === 'plan' && !plan?.imageUrl && (
            <div className={styles.alert} style={{ margin: 24 }}>
              {t('common.uploadPlanLeftPanel')}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={buildingModal === 'create'}
        title={t('mapEditor.addBuilding')}
        onClose={() => setBuildingModal(null)}
      >
        <Input
          label={t('mapEditor.newBuildingName')}
          required
          value={newBuildingName}
          onChange={(e) => setNewBuildingName(e.target.value)}
        />
        <Button
          fullWidth
          onClick={() => createBuilding.mutate()}
          disabled={!newBuildingName.trim() || createBuilding.isPending}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={buildingModal === 'edit'}
        title={t('mapEditor.renameBuilding')}
        onClose={() => setBuildingModal(null)}
      >
        <Input
          label={t('mapEditor.newBuildingName')}
          required
          value={editBuildingName}
          onChange={(e) => setEditBuildingName(e.target.value)}
        />
        <Button
          fullWidth
          onClick={() => updateBuilding.mutate(editBuildingName.trim())}
          disabled={!editBuildingName.trim() || updateBuilding.isPending}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={buildingModal === 'delete'}
        title={t('mapEditor.deleteBuilding')}
        onClose={() => setBuildingModal(null)}
      >
        <p className={styles.planMeta}>{t('mapEditor.deleteBuildingConfirm')}</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setBuildingModal(null)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => removeBuilding.mutate()} disabled={removeBuilding.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={floorModal === 'create'}
        title={t('mapEditor.addFloor')}
        onClose={() => setFloorModal(null)}
      >
        <Input
          label={t('common.floorName')}
          required
          value={newFloorName}
          onChange={(e) => setNewFloorName(e.target.value)}
        />
        <Input
          label={t('common.levelNumber')}
          type="number"
          value={newFloorLevel}
          onChange={(e) => setNewFloorLevel(e.target.value)}
        />
        <Button
          fullWidth
          onClick={() =>
            createFloor.mutate({
              name: newFloorName.trim() || t('common.floorLevel', { level: newFloorLevel }),
              levelNumber: Number(newFloorLevel) || 1,
            })
          }
          disabled={createFloor.isPending}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={floorModal === 'edit'}
        title={t('mapEditor.renameFloor')}
        onClose={() => setFloorModal(null)}
      >
        <Input
          label={t('common.floorName')}
          required
          value={editFloorName}
          onChange={(e) => setEditFloorName(e.target.value)}
        />
        <Input
          label={t('common.levelNumber')}
          type="number"
          value={editFloorLevel}
          onChange={(e) => setEditFloorLevel(e.target.value)}
        />
        <Button
          fullWidth
          onClick={() =>
            updateFloor.mutate({
              name: editFloorName.trim(),
              levelNumber: Number(editFloorLevel) || 1,
            })
          }
          disabled={!editFloorName.trim() || updateFloor.isPending}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={floorModal === 'delete'}
        title={t('mapEditor.deleteFloor')}
        onClose={() => setFloorModal(null)}
      >
        <p className={styles.planMeta}>{t('mapEditor.deleteFloorConfirm')}</p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setFloorModal(null)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => removeFloor.mutate()} disabled={removeFloor.isPending}>
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
