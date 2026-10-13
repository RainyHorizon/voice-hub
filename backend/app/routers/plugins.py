"""Plugin registration and configuration. Protected by the existing UI session."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from ..plugins import example_market, install_example, list_plugins, public_plugin, uninstall_plugin, update_plugin, get_plugin, validated_config, fetch_catalog

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


class PluginConfigBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config: dict


def call(action, *args, **kwargs):
    try:
        return action(*args, **kwargs)
    except KeyError as exc:
        raise HTTPException(404, str(exc.args[0])) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(500, "插件文件操作失败，原数据已保留") from exc


@router.get("")
def get_plugins():
    return {"plugins": [public_plugin(p) for p in call(list_plugins)]}


@router.get("/market")
def market():
    return {"plugins": call(example_market)}


@router.post("/refresh")
def refresh_plugins():
    return get_plugins()


@router.post("/{plugin_id}/install")
def install(plugin_id: str):
    return {"plugin": call(install_example, plugin_id)}


@router.post("/{plugin_id}/enable")
def enable(plugin_id: str):
    return {"plugin": call(update_plugin, plugin_id, enabled=True)}


@router.post("/{plugin_id}/disable")
def disable(plugin_id: str):
    return {"plugin": call(update_plugin, plugin_id, enabled=False)}


@router.post("/{plugin_id}/refresh")
def refresh(plugin_id: str):
    return {"plugin": call(update_plugin, plugin_id, sync=True)}


@router.put("/{plugin_id}/config")
def save_config(plugin_id: str, body: PluginConfigBody):
    return {"plugin": call(update_plugin, plugin_id, values=body.config)}


@router.post("/{plugin_id}/check")
def check(plugin_id: str, body: PluginConfigBody):
    plugin = call(get_plugin, plugin_id)
    values = call(validated_config, plugin, body.config)
    catalog = call(fetch_catalog, plugin, values)
    return {"message": "连接正常", **catalog}


@router.delete("/{plugin_id}")
def uninstall(plugin_id: str):
    call(uninstall_plugin, plugin_id)
    return {"message": "插件已卸载，生成历史及服务文件已保留"}
