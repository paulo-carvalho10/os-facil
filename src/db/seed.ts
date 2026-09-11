import { db } from './database'
import type { Cliente, EventoOS, OrdemServico, StatusOS } from './types'
import { gerarCodigoPublico } from '../domain/public-code'

const exemplos: Array<{
  cliente: string
  telefone: string
  aparelho: string
  marca: string
  modelo: string
  defeito: string
  status: StatusOS
  observacao: string
}> = [
  { cliente: 'Marina Costa', telefone: '(11) 98811-2040', aparelho: 'Celular', marca: 'Samsung', modelo: 'Galaxy A54', defeito: 'Tela trincada após queda.', status: 'aguardando_avaliacao', observacao: 'Aguardando avaliação técnica.' },
  { cliente: 'Rafael Lima', telefone: '(11) 97724-3158', aparelho: 'Celular', marca: 'Apple', modelo: 'iPhone 12', defeito: 'Bateria descarrega rapidamente.', status: 'orcamento_enviado', observacao: 'Orçamento de troca de bateria enviado.' },
  { cliente: 'Beatriz Alves', telefone: '(11) 96631-8854', aparelho: 'Notebook', marca: 'Lenovo', modelo: 'IdeaPad 3', defeito: 'Não inicia o sistema.', status: 'aprovado', observacao: 'Cliente aprovou a substituição do SSD.' },
  { cliente: 'Lucas Nunes', telefone: '(11) 95542-2107', aparelho: 'Celular', marca: 'Motorola', modelo: 'Moto G84', defeito: 'Conector USB com mau contato.', status: 'em_conserto', observacao: 'Conector em substituição na bancada 2.' },
  { cliente: 'Ana Souza', telefone: '(11) 94455-6901', aparelho: 'Tablet', marca: 'Samsung', modelo: 'Tab S8', defeito: 'Vidro quebrado, toque funcionando.', status: 'pronto', observacao: 'Reparo finalizado e aparelho disponível.' },
  { cliente: 'Diego Ramos', telefone: '(11) 93366-7712', aparelho: 'Celular', marca: 'Xiaomi', modelo: 'Redmi Note 12', defeito: 'Sem áudio nas chamadas.', status: 'entregue', observacao: 'Aparelho testado e entregue.' },
  { cliente: 'Camila Rocha', telefone: '(11) 92277-4019', aparelho: 'Videogame', marca: 'Sony', modelo: 'PlayStation 5', defeito: 'Desliga após alguns minutos.', status: 'em_conserto', observacao: 'Limpeza e troca de pasta térmica em andamento.' },
  { cliente: 'João Martins', telefone: '(11) 91188-5624', aparelho: 'Celular', marca: 'Apple', modelo: 'iPhone SE', defeito: 'Botão de início não responde.', status: 'orcamento_enviado', observacao: 'Orçamento aguardando resposta.' },
]

export async function carregarDadosDemonstracao(forcar = false): Promise<void> {
  const jaCarregado = await db.configuracoes.get('seed-versao')
  if (jaCarregado && !forcar) return

  await db.transaction(
    'rw',
    [db.clientes, db.ordens, db.eventos, db.fotos, db.filaSync, db.configuracoes],
    async () => {
      if (forcar) {
        await Promise.all([
          db.clientes.clear(), db.ordens.clear(), db.eventos.clear(),
          db.fotos.clear(), db.filaSync.clear(),
        ])
      }
      if ((await db.ordens.count()) > 0) {
        await db.configuracoes.put({ chave: 'seed-versao', valor: '1' })
        return
      }

      const inicio = Date.now() - exemplos.length * 86_400_000
      const clientes: Cliente[] = []
      const ordens: OrdemServico[] = []
      const eventos: EventoOS[] = []

      exemplos.forEach((item, indice) => {
        const instante = new Date(inicio + indice * 86_400_000).toISOString()
        const clienteId = crypto.randomUUID()
        const osId = crypto.randomUUID()
        clientes.push({
          id: clienteId,
          nome: item.cliente,
          telefone: item.telefone,
          criadoEm: instante,
          atualizadoEm: instante,
        })
        ordens.push({
          id: osId,
          numero: 1001 + indice,
          clienteId,
          aparelho: item.aparelho,
          marca: item.marca,
          modelo: item.modelo,
          defeitoRelatado: item.defeito,
          acessorios: indice % 2 ? 'Capa protetora' : 'Sem acessórios',
          orcamento: 120 + indice * 45,
          status: item.status,
          criadaEm: instante,
          atualizadaEm: instante,
          entregueEm: item.status === 'entregue' ? instante : undefined,
          codigoPublico: gerarCodigoPublico(),
          sincronizadaEm: instante,
        })
        eventos.push({
          id: crypto.randomUUID(),
          osId,
          status: item.status,
          observacao: item.observacao,
          publico: true,
          criadoEm: instante,
          atualizadoEm: instante,
        })
      })

      await db.clientes.bulkAdd(clientes)
      await db.ordens.bulkAdd(ordens)
      await db.eventos.bulkAdd(eventos)
      await db.configuracoes.put({ chave: 'seed-versao', valor: '1' })
    },
  )
}
