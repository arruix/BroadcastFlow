import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/v1';

type Desk = {
  minutesIncluded: number;
  secondsRemaining: number;
  networks: { code: string; liveMode: string; reason: string | null }[];
  connections: { id: string; network: string; status: string }[];
  session: { id: string; status: string; destinations: { network: string; status: string; failureReason?: string }[] } | null;
};

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [desk, setDesk] = useState<Desk | null>(null);
  const [disputes, setDisputes] = useState('Sin disputas.');
  const [message, setMessage] = useState('Sala de live. El mismo ingreso que la web.');

  async function login() {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-surface': 'tablet' },
      body: JSON.stringify({ email, password }),
    });
    const body = (await response.json()) as { accessToken?: string; code?: string };
    if (!response.ok || !body.accessToken) {
      setMessage(body.code ?? 'No se pudo entrar.');
      return;
    }
    setToken(body.accessToken);
    const organizations = await fetch(`${apiUrl}/organizations`, { headers: { authorization: `Bearer ${body.accessToken}` } });
    const rows = (await organizations.json()) as { id: string }[];
    setOrganizationId(rows[0]?.id ?? '');
    setMessage(rows[0] ? 'Elige la campaña y emite.' : 'Esta cuenta no tiene organización.');
  }

  async function load(org = organizationId, campaign = campaignId) {
    const response = await fetch(`${apiUrl}/campaigns/${campaign}/live`, {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': org },
    });
    if (!response.ok) {
      setMessage('No se pudo leer la sala.');
      return;
    }
    setDesk((await response.json()) as Desk);
  }

  async function goLive() {
    const connectionIds = desk?.connections.filter((connection) => connection.status === 'active').map((connection) => connection.id) ?? [];
    const opened = await fetch(`${apiUrl}/campaigns/${campaignId}/live-sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId, 'content-type': 'application/json' },
      body: JSON.stringify({ connectionIds }),
    });
    const session = (await opened.json()) as { id?: string; code?: string };
    if (!opened.ok || !session.id) {
      setMessage(session.code ?? 'La sala no abrió.');
      return;
    }
    await fetch(`${apiUrl}/live-sessions/${session.id}/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId },
    });
    await load();
  }

  async function loadDisputes() {
    const response = await fetch(`${apiUrl}/campaigns/${campaignId}/disputes`, {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId },
    });
    const body = (await response.json()) as { donationId: string; status: string; dueAt: string; code?: string }[];
    if (!response.ok) {
      setDisputes((body as { code?: string }).code ?? 'No se pudieron leer las disputas.');
      return;
    }
    setDisputes(body.length ? body.map((row) => `${row.status} · vence ${row.dueAt.slice(0, 10)}`).join('\n') : 'No hay disputas abiertas.');
  }

  async function requestPdf() {
    const created = await fetch(`${apiUrl}/campaigns/${campaignId}/ledger/report`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId, 'x-surface': 'tablet' },
    });
    const job = (await created.json()) as { id?: string; code?: string };
    if (!created.ok || !job.id) {
      setDisputes(job.code ?? 'No se pudo pedir el PDF.');
      return;
    }
    const file = await fetch(`${apiUrl}/reports/${job.id}`, {
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId },
    });
    setDisputes(file.ok ? 'PDF listo.' : 'No se pudo pedir el PDF.');
  }

  async function stop() {
    if (!desk?.session) return;
    await fetch(`${apiUrl}/live-sessions/${desk.session.id}/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-organization-id': organizationId },
    });
    await load();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>En vivo</Text>
      <Text>{message}</Text>
      {token ? null : (
        <View style={styles.stack}>
          <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Correo" />
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Contraseña" />
          <Pressable style={styles.button} onPress={login}>
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>
        </View>
      )}
      {token ? (
        <View style={styles.stack}>
          <TextInput style={styles.input} value={campaignId} onChangeText={setCampaignId} placeholder="Campaña" />
          <Pressable style={styles.button} onPress={() => load()}>
            <Text style={styles.buttonText}>Ver sala</Text>
          </Pressable>
          <Text>{disputes}</Text>
          <Pressable style={styles.button} onPress={loadDisputes}>
            <Text style={styles.buttonText}>Consultar disputas</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={requestPdf}>
            <Text style={styles.buttonText}>Pedir PDF</Text>
          </Pressable>
        </View>
      ) : null}
      {desk ? (
        <View style={styles.row}>
          <View style={styles.preview}>
            <Text style={styles.previewText}>Vista previa</Text>
          </View>
          <View style={styles.stack}>
            <Text>{Math.floor(desk.secondsRemaining / 60)} minutos de {desk.minutesIncluded}</Text>
            {desk.networks.map((network) => (
              <Text key={network.code}>
                {network.code}
                {network.reason ? ` · ${network.reason}` : ''}
                {desk.session?.destinations.find((destination) => destination.network === network.code)
                  ? ` · ${desk.session.destinations.find((destination) => destination.network === network.code)?.status}`
                  : ''}
              </Text>
            ))}
            {desk.session?.status === 'live' ? (
              <Pressable style={styles.button} onPress={stop}>
                <Text style={styles.buttonText}>Detener</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.button} onPress={goLive}>
                <Text style={styles.buttonText}>Emitir</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  stack: { gap: 12 },
  row: { gap: 16 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#ccc', paddingHorizontal: 12 },
  button: { minHeight: 44, backgroundColor: '#171717', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { color: '#fff' },
  preview: { minHeight: 180, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center' },
  previewText: { color: '#fff' },
});
