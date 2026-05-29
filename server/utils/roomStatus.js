const STATUS_COLORS = {
  free: '#E8EDF3',
  ready_for_rent: '#B8E8C8',
  occupied: '#8FD4A8',
  negotiation: '#FFE08A',
  reserved: '#B8D9F5',
  debt: '#F5A0A0',
  repair: '#E5E7EB',
  technical: '#EDF0F4',
  not_available: '#C5CBD3',
};

const STATUS_LABELS = {
  free: 'Свободно',
  ready_for_rent: 'Готово к сдаче',
  occupied: 'Сдано',
  negotiation: 'Переговоры',
  reserved: 'Бронь',
  debt: 'Задолженность',
  repair: 'Ремонт',
  technical: 'Техническое',
  not_available: 'Не сдаётся',
};

const ALL_STATUSES = Object.keys(STATUS_COLORS);

module.exports = { STATUS_COLORS, STATUS_LABELS, ALL_STATUSES };
